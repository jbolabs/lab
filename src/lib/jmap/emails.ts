import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { messages } from "@/db/schema";
import { joinEmailAddressList } from "@/lib/email/address";
import type { AttachmentContent } from "@/lib/email/attachment-types";
import { storeMessageAttachments } from "@/lib/email/attachments";
import { deleteMessageWithObjects } from "@/lib/email/message-cleanup";
import { buildSnippet, parseRawMime } from "@/lib/email/parse";
import { getAuthorizedSenderAddress } from "@/lib/email/sender";
import { resolveThreadId } from "@/lib/email/threading";
import { newId } from "@/lib/ids";
import { requireValue } from "@/lib/require-value";

import { listAccessibleMailboxIdSet, listJmapMailboxes } from "./access";
import { deleteUpload, readUpload, storeRawDraftMime } from "./blobs";
import { emailChangesSince, threadChangesSince } from "./changes";
import { LIMITS, KEYWORD_FLAGGED, KEYWORD_SEEN } from "./constants";
import {
	importFlags,
	parseReceivedAt,
	resolveDraftsMailbox,
} from "./email-import-utils";
import {
	buildEmailObject,
	loadAttachmentsByMessage,
	resolveHeaderProperty,
} from "./email-objects";
import { filterToSql, sortToSql } from "./email-query";
import { JmapError } from "./errors";
import { decodeBlobId, decodeMailboxRef, roleToStatus } from "./ids";
import { getEmailState } from "./state";
import type {
	Comparator,
	EmailAddressObject,
	Filter,
	JmapContext,
	JmapMethodHandler,
	JmapSetError,
	MailboxRef,
} from "./types";

const escape = (value: string) =>
	value.replaceAll(/[&<>]/gu, (char) =>
		requireValue({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char])
	);

const addressList = (list: unknown) =>
	Array.isArray(list)
		? joinEmailAddressList(
				(list as EmailAddressObject[]).map((item) =>
					item.name
						? `"${item.name.replaceAll('"', '\\"')}" <${item.email}>`
						: item.email
				)
			)
		: "";

/** The columns a draft row is made of, shared by `Email/set` create and `Email/import`. */
interface DraftRow {
	mailboxId: string;
	fromAddr: string;
	toAddr: string;
	ccAddr: string | null;
	bccAddr: string | null;
	subject: string | null;
	textBody: string | null;
	htmlBody: string | null;
	inReplyTo: string | null;
	references: string | null;
	read?: boolean;
	starred?: boolean;
	threadId?: string | null;
	providerMessageId?: string | null;
	rawR2Key?: string | null;
	createdAt?: Date;
}

/** Insert a draft and return its id. Drafts are outbound mail that has not been sent. */
async function insertDraft(ctx: JmapContext, row: DraftRow): Promise<string> {
	const id = newId("msg");
	await ctx.db.insert(messages).values({
		bccAddr: row.bccAddr,
		ccAddr: row.ccAddr,
		direction: "outbound",
		fromAddr: row.fromAddr,
		htmlBody: row.htmlBody,
		id,
		inReplyTo: row.inReplyTo,
		mailboxId: row.mailboxId,
		providerMessageId: row.providerMessageId ?? null,
		rawR2Key: row.rawR2Key ?? null,
		read: row.read ?? true,
		references: row.references,
		snippet: buildSnippet(row.textBody, row.htmlBody),
		starred: row.starred ?? false,
		status: "draft",
		subject: row.subject,
		textBody: row.textBody,
		threadId: row.threadId ?? null,
		toAddr: row.toAddr,
		userId: ctx.auth.userId,
		...(row.createdAt ? { createdAt: row.createdAt } : {}),
	});
	return id;
}

async function scope(ctx: JmapContext) {
	const ids = [...(await listAccessibleMailboxIdSet(ctx))];
	return {
		condition: (() => {
			if (ids.length) {
				return inArray(messages.mailboxId, ids);
			}
			if (ctx.auth.mailboxIds) {
				return sql`1 = 0`;
			}
			return eq(messages.userId, ctx.auth.userId);
		})(),
		ids,
	};
}

type MessageRow = typeof messages.$inferSelect;

export async function loadMessages(
	ctx: JmapContext,
	ids: string[]
): Promise<MessageRow[]> {
	if (ids.length === 0) {
		return [];
	}
	const { ids: accessible, condition } = await scope(ctx);
	// D1 caps bound parameters per query at 100, and the scope predicate
	// already binds the accessible mailbox ids, so the remainder is the id
	// batch size. Callers key rows by id, so dedupe first: an id split over
	// two batches would otherwise return its row twice.
	const batch = Math.max(1, 100 - accessible.length);
	const unique = [...new Set(ids)];
	const rows: MessageRow[] = [];
	for (let offset = 0; offset < unique.length; offset += batch) {
		rows.push(
			...(await ctx.db
				.select()
				.from(messages)
				.where(
					and(
						condition,
						inArray(messages.id, unique.slice(offset, offset + batch))
					)
				))
		);
	}
	return rows;
}

/** RFC 6901 unescape: ~1 -> /, then ~0 -> ~ (order matters for ~01 -> ~1 round-trip). */
function unescapeJsonPointer(token: string): string {
	return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

/** Where a patched `mailboxIds` puts the message: exactly one JMAP mailbox is supported. */
function targetFromMailboxIds(
	row: MessageRow,
	patch: Record<string, unknown>,
	accessible: Set<string>
):
	| { status?: string; folderId?: string | null }
	| { error: Record<string, unknown> }
	| null {
	let ids: string[] | null = null;
	if (patch.mailboxIds && typeof patch.mailboxIds === "object") {
		ids = Object.entries(patch.mailboxIds as Record<string, boolean>)
			.filter(([, on]) => on)
			.map(([id]) => id);
	} else {
		const current = new Set(
			Object.keys(
				buildEmailObject(row, [], { fetchBodies: false, maxBodyValueBytes: 0 })
					.mailboxIds
			)
		);
		let touched = false;
		for (const [key, value] of Object.entries(patch)) {
			if (!key.startsWith("mailboxIds/")) {
				continue;
			}
			touched = true;
			const id = unescapeJsonPointer(key.slice("mailboxIds/".length));
			if (value) {
				current.add(id);
			} else {
				current.delete(id);
			}
		}
		if (touched) {
			ids = [...current];
		}
	}
	if (!ids) {
		return null;
	}
	if (ids.length !== 1) {
		return {
			error: {
				description: "A message belongs to exactly one mailbox",
				properties: ["mailboxIds"],
				type: "invalidProperties",
			},
		};
	}
	const ref: MailboxRef | null = decodeMailboxRef(ids[0]);
	if (!ref || !accessible.has(ref.mailboxId)) {
		return {
			error: {
				description: "Unknown mailbox",
				properties: ["mailboxIds"],
				type: "invalidProperties",
			},
		};
	}
	if (ref.mailboxId !== row.mailboxId) {
		return {
			error: {
				description: "Messages cannot move between accounts' mailboxes",
				properties: ["mailboxIds"],
				type: "invalidProperties",
			},
		};
	}
	if (ref.kind === "account") {
		return {
			error: {
				description: "Choose a folder or system mailbox",
				properties: ["mailboxIds"],
				type: "invalidProperties",
			},
		};
	}
	if (ref.kind === "folder") {
		return {
			folderId: ref.folderId,
			status:
				row.direction === "outbound" && row.status !== "draft"
					? "sent"
					: "received",
		};
	}
	if (ref.role === "sent" && row.direction === "inbound") {
		return {
			error: {
				description: "Received mail cannot be moved to Sent",
				properties: ["mailboxIds"],
				type: "invalidProperties",
			},
		};
	}
	return { folderId: null, status: roleToStatus(ref.role) };
}

function keywordsFromPatch(patch: Record<string, unknown>): {
	read?: boolean;
	starred?: boolean;
} {
	const result: { read?: boolean; starred?: boolean } = {};
	const apply = (keyword: string, value: unknown) => {
		if (keyword === KEYWORD_SEEN) {
			result.read = !!value;
		}
		if (keyword === KEYWORD_FLAGGED) {
			result.starred = !!value;
		}
	};
	if (patch.keywords && typeof patch.keywords === "object") {
		const map = patch.keywords as Record<string, boolean>;
		result.read = !!map[KEYWORD_SEEN];
		result.starred = !!map[KEYWORD_FLAGGED];
	}
	for (const [key, value] of Object.entries(patch)) {
		if (key.startsWith("keywords/")) {
			apply(unescapeJsonPointer(key.slice("keywords/".length)), value);
		}
	}
	return result;
}

/** Drafts are the only thing a client creates; everything else is a flag or a move. */
async function createDraft(
	ctx: JmapContext,
	value: Record<string, unknown>,
	accessible: Set<string>
) {
	const target = resolveDraftsMailbox(value.mailboxIds, accessible);
	if ("error" in target) {
		return target;
	}
	const from = (value.from as EmailAddressObject[] | undefined)?.[0]?.email;
	if (!from) {
		return { error: { properties: ["from"], type: "invalidProperties" } };
	}
	let sender: { fromAddr: string; mailboxId: string };
	try {
		sender = await getAuthorizedSenderAddress(ctx.env, {
			from,
			mailboxId: target.mailboxId,
			userId: ctx.auth.userId,
		});
	} catch (error) {
		return {
			error: {
				description:
					error instanceof Error
						? error.message
						: "Cannot send from that address",
				type: "forbidden",
			},
		};
	}
	const bodyValues = (value.bodyValues ?? {}) as Record<
		string,
		{ value: string }
	>;
	const partText = (parts: unknown) =>
		Array.isArray(parts) && parts[0]?.partId
			? (bodyValues[parts[0].partId]?.value ?? "")
			: "";
	const text = partText(value.textBody);
	const html = partText(value.htmlBody);
	const references = Array.isArray(value.references)
		? (value.references as string[]).join(" ")
		: null;

	const id = await insertDraft(ctx, {
		bccAddr: addressList(value.bcc) || null,
		ccAddr: addressList(value.cc) || null,
		fromAddr: sender.fromAddr,
		htmlBody: html || null,
		inReplyTo: Array.isArray(value.inReplyTo)
			? ((value.inReplyTo as string[])[0] ?? null)
			: null,
		mailboxId: sender.mailboxId,
		references,
		subject: typeof value.subject === "string" ? value.subject : null,
		textBody: text || null,
		toAddr: addressList(value.to),
	});
	const storeUploadedAttachments = async () => {
		const uploads: AttachmentContent[] = [];
		for (const part of (value.attachments as
			| {
					blobId?: string;
					name?: string;
					type?: string;
					disposition?: string;
					cid?: string;
			  }[]
			| undefined) ?? []) {
			const blob = part.blobId ? decodeBlobId(part.blobId) : null;
			if (!blob || blob.kind !== "up") {
				continue;
			}
			const upload = await readUpload(ctx, blob.id);
			if (!upload) {
				continue;
			}
			uploads.push({
				content: upload.content,
				contentId: part.cid ?? null,
				disposition:
					part.disposition === "inline"
						? ("inline" as const)
						: ("attachment" as const),
				filename: part.name ?? upload.name ?? "attachment",
				type: part.type ?? upload.type,
			});
		}
		if (uploads.length) {
			try {
				await storeMessageAttachments(ctx.env, id, uploads);
			} catch (error) {
				await ctx.db.delete(messages).where(eq(messages.id, id));
				return {
					error: {
						description:
							error instanceof Error ? error.message : "Attachments rejected",
						type: "tooLarge",
					},
				};
			}
		}
		return { id };
	};
	return await storeUploadedAttachments();
}

/**
 * Import one uploaded `message/rfc822` blob as a draft (RFC 8621 §4.8). Clients
 * that compose MIME locally send by uploading it, importing it into Drafts and
 * then submitting it, so this is the first half of their send path. The raw
 * bytes are kept verbatim under `drafts/` and the parsed headers fill the
 * columns the rest of Mailflare reads, including `providerMessageId`, which is
 * what lets a client find its own draft again with a Message-ID header filter.
 */
async function importEmail(
	ctx: JmapContext,
	value: Record<string, unknown>,
	writable: Set<string>
): Promise<{ id: string } | { error: JmapSetError }> {
	const target = resolveDraftsMailbox(value.mailboxIds, writable);
	if ("error" in target) {
		return target;
	}

	const blob =
		typeof value.blobId === "string" ? decodeBlobId(value.blobId) : null;
	if (!blob || blob.kind !== "up") {
		return {
			error: {
				description: "blobId must name an upload from this account",
				type: "blobNotFound",
			},
		};
	}
	const upload = await readUpload(ctx, blob.id);
	if (!upload) {
		return { error: { description: "No such upload", type: "blobNotFound" } };
	}
	if (upload.content.byteLength === 0) {
		return {
			error: { description: "The blob is empty", type: "invalidEmail" },
		};
	}
	if (upload.content.byteLength > LIMITS.maxSizeUpload) {
		return {
			error: {
				description: "The message exceeds maxSizeUpload",
				type: "tooLarge",
			},
		};
	}

	let parsed: Awaited<ReturnType<typeof parseRawMime>>;
	try {
		parsed = await parseRawMime(upload.content);
	} catch (error) {
		return {
			error: {
				description:
					error instanceof Error
						? error.message
						: "The blob is not a MIME message",
				type: "invalidEmail",
			},
		};
	}
	if (!parsed.fromAddr) {
		return {
			error: {
				description: "The message has no From header",
				type: "invalidEmail",
			},
		};
	}

	let sender: { fromAddr: string; mailboxId: string };
	try {
		sender = await getAuthorizedSenderAddress(ctx.env, {
			from: parsed.fromAddr,
			mailboxId: target.mailboxId,
			userId: ctx.auth.userId,
		});
	} catch (error) {
		return {
			error: {
				description:
					error instanceof Error
						? error.message
						: "Cannot send from that address",
				type: "forbidden",
			},
		};
	}
	const persistImportedMessage = async (): Promise<
		{ id: string } | { error: JmapSetError }
	> => {
		const flags = importFlags(value.keywords);
		const id = await insertDraft(ctx, {
			bccAddr: parsed.bccAddr,

			ccAddr: parsed.ccAddr,

			createdAt: parseReceivedAt(value.receivedAt) ?? parsed.date ?? new Date(),

			fromAddr: sender.fromAddr,

			htmlBody: parsed.html,

			inReplyTo: parsed.inReplyTo,

			mailboxId: sender.mailboxId,

			// Angle brackets are kept, as inbound rows store them.
			providerMessageId: parsed.messageId,

			read: flags.read,

			references: parsed.references.length ? parsed.references.join(" ") : null,

			starred: flags.starred,

			subject: parsed.subject,

			textBody: parsed.text,

			threadId: await resolveThreadId(ctx.db, {
				inReplyTo: parsed.inReplyTo,
				mailboxId: sender.mailboxId,
				messageId: parsed.messageId,
				references: parsed.references,
			}),

			toAddr: parsed.toAddr ?? "",
		});

		// Nothing may be left half-imported, so the row and the bytes go together.
		let rawR2Key: string | null = null;
		try {
			rawR2Key = await storeRawDraftMime(ctx, id, upload.content);
			await ctx.db
				.update(messages)
				.set({ rawR2Key })
				.where(eq(messages.id, id));
			if (parsed.attachments.length) {
				await storeMessageAttachments(ctx.env, id, parsed.attachments);
			}
		} catch (error) {
			try {
				await deleteMessageWithObjects(ctx.env, ctx.db, id, rawR2Key);
			} catch (cleanupError) {
				console.error(
					`Failed to clean up rejected Email/import draft ${id}`,
					cleanupError
				);
			}
			return {
				error: {
					description:
						error instanceof Error ? error.message : "Attachments rejected",
					type: "tooLarge",
				},
			};
		}
		// The bytes belong to the message now, so release the upload.
		try {
			await deleteUpload(ctx, blob.id);
		} catch (error) {
			// The import is already complete. Failing it here would make a client retry
			// and create a duplicate draft merely because temporary cleanup failed.
			console.warn(`Failed to delete claimed JMAP upload ${blob.id}`, error);
		}
		return { id };
	};
	return await persistImportedMessage();
}

export { count, desc } from "drizzle-orm";

export const emailGet: JmapMethodHandler = async (ctx, args) => {
	const ids = args.ids as string[] | null | undefined;
	if (!ids) {
		throw new JmapError(
			"requestTooLarge",
			"Email/get needs an explicit list of ids"
		);
	}
	if (ids.length > LIMITS.maxObjectsInGet) {
		throw new JmapError("requestTooLarge");
	}
	const properties = args.properties as string[] | null | undefined;
	const fetchBodies = !!(
		args.fetchTextBodyValues ||
		args.fetchHTMLBodyValues ||
		args.fetchAllBodyValues
	);
	const maxBodyValueBytes = Number(args.maxBodyValueBytes ?? 0);

	const rows = await loadMessages(ctx, ids);
	const attachments = await loadAttachmentsByMessage(
		ctx,
		rows.map((row) => row.id)
	);
	const found = new Set<string>();
	const list = rows.map((row) => {
		found.add(row.id);
		const full = buildEmailObject(row, attachments.get(row.id) ?? [], {
			fetchBodies,
			maxBodyValueBytes,
		});
		if (!properties) {
			return full;
		}
		const picked: Record<string, unknown> = { id: row.id };
		for (const key of properties) {
			if (key.startsWith("header:")) {
				picked[key] = resolveHeaderProperty(row, key);
			} else if (key in full) {
				picked[key] = (full as Record<string, unknown>)[key];
			}
		}
		return picked;
	});
	return {
		accountId: ctx.accountId,
		list,
		notFound: ids.filter((id) => !found.has(id)),
		state: await getEmailState(ctx),
	};
};

export const emailQuery: JmapMethodHandler = async (ctx, args) => {
	const { ids: accessibleIds, condition } = await scope(ctx);
	const filter = filterToSql(
		args.filter as Filter | null | undefined,
		new Set(accessibleIds)
	);
	const where = filter ? and(condition, filter) : condition;
	const order = sortToSql(args.sort as Comparator[] | null | undefined);
	const collapse = !!args.collapseThreads;
	const limit = Math.min(
		Math.max(Number(args.limit ?? LIMITS.maxQueryLimit), 0),
		LIMITS.maxQueryLimit
	);
	let position = Number(args.position ?? 0);

	// Anchors are resolved by materialising the ordered id list up to a bound;
	// mailboxes here are small enough that this stays cheap.
	const threadKey = sql<string>`coalesce(${messages.threadId}, ${messages.id})`;
	const allRows = await ctx.db
		.select({ id: messages.id, thread: threadKey })
		.from(messages)
		.where(where)
		.orderBy(...order)
		.limit(10_000);
	let ordered = allRows.map((row) => row.id);
	if (collapse) {
		const seen = new Set<string>();
		ordered = allRows
			.filter((row) =>
				seen.has(row.thread) ? false : (seen.add(row.thread), true)
			)
			.map((row) => row.id);
	}
	if (args.anchor) {
		const index = ordered.indexOf(String(args.anchor));
		if (index === -1) {
			return { type: "anchorNotFound" };
		}
		position = index + Number(args.anchorOffset ?? 0);
	}
	if (position < 0) {
		position = Math.max(ordered.length + position, 0);
	}
	const page = ordered.slice(position, position + limit);

	return {
		accountId: ctx.accountId,
		canCalculateChanges: false,
		ids: page,
		position,
		queryState: await getEmailState(ctx),
		...(args.calculateTotal ? { total: ordered.length } : {}),
	};
};

export const emailChanges: JmapMethodHandler = async (ctx, args) =>
	await emailChangesSince(ctx, args);

export const emailQueryChanges: JmapMethodHandler = async () =>
	await {
		type: "cannotCalculateChanges",
	};

export const emailSet: JmapMethodHandler = async (ctx, args) => {
	const oldState = await getEmailState(ctx);
	if (args.ifInState && args.ifInState !== oldState) {
		return { type: "stateMismatch" };
	}
	const accessible = await listAccessibleMailboxIdSet(ctx);
	const writable = new Set(
		await listJmapMailboxes(ctx)
			.then((resolved) =>
				resolved.filter((row) => row.permission !== "read_only")
			)
			.then((resolved) => resolved.map((row) => row.id))
	);
	const created: Record<string, unknown> = {};
	const notCreated: Record<string, unknown> = {};
	const updated: Record<string, null> = {};
	const notUpdated: Record<string, unknown> = {};
	const destroyed: string[] = [];
	const notDestroyed: Record<string, unknown> = {};

	for (const [creationId, value] of Object.entries(
		(args.create ?? {}) as Record<string, Record<string, unknown>>
	)) {
		const applyCreation = async () => {
			const result = await createDraft(ctx, value, writable);
			if ("error" in result) {
				notCreated[creationId] = result.error;
				return;
			}
			ctx.createdIds[creationId] = result.id;
			const [row] = await loadMessages(ctx, [result.id]);
			created[creationId] = row
				? buildEmailObject(row, [], {
						fetchBodies: false,
						maxBodyValueBytes: 0,
					})
				: { id: result.id };
		};
		await applyCreation();
	}

	const updates = Object.entries(
		(args.update ?? {}) as Record<string, Record<string, unknown>>
	);
	const rows = await loadMessages(
		ctx,
		updates.map(([id]) => id)
	);
	const byId = new Map(rows.map((row) => [row.id, row]));
	for (const [id, patch] of updates) {
		const applyUpdate = async () => {
			const row = byId.get(id);
			if (!row || !row.mailboxId) {
				notUpdated[id] = { type: "notFound" };
				return;
			}
			if (!writable.has(row.mailboxId)) {
				notUpdated[id] = { type: "forbidden" };
				return;
			}
			const move = targetFromMailboxIds(row, patch, accessible);
			if (move && "error" in move) {
				notUpdated[id] = move.error;
				return;
			}
			const flags = keywordsFromPatch(patch);
			const set: Partial<MessageRow> = {};
			if (flags.read !== undefined) {
				set.read = flags.read;
			}
			if (flags.starred !== undefined) {
				set.starred = flags.starred;
			}
			if (move) {
				if (move.status !== undefined) {
					set.status = move.status;
				}
				if (move.folderId !== undefined) {
					set.folderId = move.folderId;
				}
			}
			if (Object.keys(set).length) {
				await ctx.db.update(messages).set(set).where(eq(messages.id, id));
			}
			updated[id] = null;
		};
		await applyUpdate();
	}

	// JMAP destroy is permanent; Mailflare keeps a trash, so destroy moves there
	// and a second destroy from Trash deletes the row.
	const destroyIds = (args.destroy ?? []) as string[];
	const destroyRows = await loadMessages(ctx, destroyIds);
	const destroyById = new Map(destroyRows.map((row) => [row.id, row]));
	for (const id of destroyIds) {
		const applyUpdate = async () => {
			const row = destroyById.get(id);
			if (!row || !row.mailboxId) {
				notDestroyed[id] = { type: "notFound" };
				return;
			}
			if (!writable.has(row.mailboxId)) {
				notDestroyed[id] = { type: "forbidden" };
				return;
			}
			await (row.status === "trash" || row.status === "draft"
				? deleteMessageWithObjects(ctx.env, ctx.db, row.id, row.rawR2Key)
				: ctx.db
						.update(messages)
						.set({ folderId: null, status: "trash" })
						.where(eq(messages.id, id)));
			destroyed.push(id);
		};
		await applyUpdate();
	}

	return {
		accountId: ctx.accountId,
		created,
		destroyed,
		newState: await getEmailState(ctx),
		notCreated,
		notDestroyed,
		notUpdated,
		oldState,
		updated,
	};
};

export const emailImport: JmapMethodHandler = async (ctx, args) => {
	const oldState = await getEmailState(ctx);
	if (args.ifInState && args.ifInState !== oldState) {
		return { type: "stateMismatch" };
	}
	const emails = (args.emails ?? {}) as Record<string, Record<string, unknown>>;
	if (Object.keys(emails).length > LIMITS.maxObjectsInSet) {
		throw new JmapError("requestTooLarge");
	}
	const writable = new Set(
		await listJmapMailboxes(ctx)
			.then((resolved) =>
				resolved.filter((row) => row.permission !== "read_only")
			)
			.then((resolved) => resolved.map((row) => row.id))
	);
	const created: Record<string, unknown> = {};
	const notCreated: Record<string, unknown> = {};

	for (const [creationId, value] of Object.entries(emails)) {
		const result = await importEmail(ctx, value ?? {}, writable);
		if ("error" in result) {
			notCreated[creationId] = result.error;
			continue;
		}
		ctx.createdIds[creationId] = result.id;
		const [row] = await loadMessages(ctx, [result.id]);
		if (!row) {
			notCreated[creationId] = {
				description: "The imported message could not be read back",
				type: "serverFail",
			};
			continue;
		}
		// The same values Email/get would answer, so the client can act on them straight away.
		const object = buildEmailObject(
			row,
			(await loadAttachmentsByMessage(ctx, [row.id]).then((resolved) =>
				resolved.get(row.id)
			)) ?? [],
			{ fetchBodies: false, maxBodyValueBytes: 0 }
		);
		created[creationId] = {
			blobId: object.blobId,
			id: object.id,
			size: object.size,
			threadId: object.threadId,
		};
	}

	return {
		accountId: ctx.accountId,
		created,
		newState: await getEmailState(ctx),
		notCreated,
		oldState,
	};
};

export const emailUnsupported =
	(method: string): JmapMethodHandler =>
	async () =>
		await {
			description: `${method} is not supported`,
			type: "unknownMethod",
		};

/** Thread/get: every message sharing a thread key, oldest first. */
export const threadGet: JmapMethodHandler = async (ctx, args) => {
	const ids = args.ids as string[] | null | undefined;
	if (!ids) {
		throw new JmapError(
			"requestTooLarge",
			"Thread/get needs an explicit list of ids"
		);
	}
	const { ids: accessible, condition } = await scope(ctx);
	const threadKey = sql<string>`coalesce(${messages.threadId}, ${messages.id})`;
	// Same D1 bound-parameter budget as loadMessages; dedupe so a repeated
	// thread id cannot list its messages twice within one group.
	const batch = Math.max(1, 100 - accessible.length);
	const unique = [...new Set(ids)];
	const rows: { id: string; thread: string }[] = [];
	for (let offset = 0; offset < unique.length; offset += batch) {
		rows.push(
			...(await ctx.db
				.select({ id: messages.id, thread: threadKey })
				.from(messages)
				.where(
					and(
						condition,
						inArray(threadKey, unique.slice(offset, offset + batch))
					)
				)
				.orderBy(asc(messages.createdAt)))
		);
	}
	const grouped = new Map<string, string[]>();
	for (const row of rows) {
		grouped.set(row.thread, [...(grouped.get(row.thread) ?? []), row.id]);
	}
	return {
		accountId: ctx.accountId,
		list: Array.from(grouped, ([id, emailIds]) => ({ emailIds, id })),
		notFound: ids.filter((id) => !grouped.has(id)),
		state: await getEmailState(ctx),
	};
};

export const threadChanges: JmapMethodHandler = async (ctx, args) =>
	await threadChangesSince(ctx, args);

/** SearchSnippet/get: the subject and a body excerpt around the first match, with <mark> tags. */
export const searchSnippetGet: JmapMethodHandler = async (ctx, args) => {
	const ids = (args.emailIds as string[]) ?? [];
	const filter = (args.filter ?? {}) as {
		text?: string;
		subject?: string;
		body?: string;
	};
	const term = (filter.text ?? filter.body ?? filter.subject ?? "").trim();
	const rows = await loadMessages(ctx, ids);
	const found = new Set<string>();
	const highlight = (value: string | null) => {
		if (!value) {
			return null;
		}
		if (!term) {
			return escape(value);
		}
		const re = new RegExp(
			term.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
			"igu"
		);
		return escape(value).replaceAll(re, (match) => `<mark>${match}</mark>`);
	};
	const list = rows.map((row) => {
		found.add(row.id);
		const body = row.textBody ?? row.snippet ?? "";
		let excerpt: string | null = null;
		if (term) {
			const index = body.toLowerCase().indexOf(term.toLowerCase());
			if (index !== -1) {
				excerpt = highlight(body.slice(Math.max(index - 80, 0), index + 160));
			}
		}
		return {
			emailId: row.id,
			preview: excerpt,
			subject: highlight(row.subject),
		};
	});
	return {
		accountId: ctx.accountId,
		list,
		notFound: ids.filter((id) => !found.has(id)),
	};
};
