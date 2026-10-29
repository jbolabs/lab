import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { folders, messages } from "@/db/schema";
import { newId } from "@/lib/ids";
import { requireValue } from "@/lib/require-value";

import { listFoldersByMailbox, listJmapMailboxes } from "./access";
import { mailboxChangesSince } from "./changes";
import { JmapError } from "./errors";
import {
	decodeMailboxRef,
	encodeMailboxRef,
	roleToStatus,
	SYSTEM_ROLES,
} from "./ids";
import { getMailboxState } from "./state";
import type {
	AccessibleMailbox,
	JmapContext,
	JmapMethodHandler,
	SystemRole,
} from "./types";

function statusRole(status: string): SystemRole | null {
	for (const role of SYSTEM_ROLES) {
		if (roleToStatus(role) === status) {
			return role;
		}
	}
	if (status === "queued" || status === "failed") {
		return "sent";
	}
	return null;
}

interface Counts {
	total: number;
	unread: number;
}

/**
 * Per-mailbox tallies in one pass: rows grouped by (mailbox, status, folder)
 * are folded into the JMAP Mailbox each combination belongs to.
 */
async function loadCounts(
	ctx: JmapContext,
	mailboxIds: string[]
): Promise<Map<string, Counts>> {
	const result = new Map<string, Counts>();
	if (mailboxIds.length === 0) {
		return result;
	}
	const rows = await ctx.db
		.select({
			folderId: messages.folderId,
			mailboxId: messages.mailboxId,
			status: messages.status,
			total: count(),
			unread: sql<number>`sum(case when ${messages.read} = 0 and ${messages.direction} = 'inbound' then 1 else 0 end)`,
		})
		.from(messages)
		.where(inArray(messages.mailboxId, mailboxIds))
		.groupBy(messages.mailboxId, messages.status, messages.folderId);

	const add = (key: string, row: { total: number; unread: number }) => {
		const current = result.get(key) ?? { total: 0, unread: 0 };
		result.set(key, {
			total: current.total + row.total,
			unread: current.unread + Number(row.unread ?? 0),
		});
	};
	for (const row of rows) {
		if (!row.mailboxId) {
			continue;
		}
		add(encodeMailboxRef({ kind: "account", mailboxId: row.mailboxId }), row);
		if (row.folderId) {
			add(
				encodeMailboxRef({
					folderId: row.folderId,
					kind: "folder",
					mailboxId: row.mailboxId,
				}),
				row
			);
			continue;
		}
		const role = statusRole(row.status);
		if (role) {
			add(
				encodeMailboxRef({ kind: "role", mailboxId: row.mailboxId, role }),
				row
			);
		}
	}
	return result;
}

function rights(mailbox: AccessibleMailbox, system: boolean) {
	const canWrite = mailbox.permission !== "read_only";
	const canSend =
		mailbox.permission === "send_as" ||
		mailbox.permission === "send_on_behalf" ||
		mailbox.permission === "full_access";
	return {
		mayAddItems: canWrite,
		mayCreateChild: mailbox.permission === "full_access",
		mayDelete: !system && mailbox.permission === "full_access",
		mayReadItems: true,
		mayRemoveItems: canWrite,
		mayRename: !system && mailbox.permission === "full_access",
		maySetKeywords: canWrite,
		maySetSeen: canWrite,
		maySubmit: canSend,
	};
}

const ROLE_NAMES: Record<SystemRole, string> = {
	archive: "Archive",
	drafts: "Drafts",
	inbox: "Inbox",
	junk: "Spam",
	sent: "Sent",
	trash: "Trash",
};

const ROLE_ORDER: Record<SystemRole, number> = {
	archive: 4,
	drafts: 2,
	inbox: 1,
	junk: 5,
	sent: 3,
	trash: 6,
};

/** Every Mailbox object visible to the account. */
export async function buildAllMailboxes(ctx: JmapContext) {
	const accessible = await listJmapMailboxes(ctx);
	const ids = accessible.map((row) => row.id);
	const [foldersByMailbox, counts] = await Promise.all([
		listFoldersByMailbox(ctx, ids),
		loadCounts(ctx, ids),
	]);
	const list: Record<string, unknown>[] = [];
	let sortBase = 0;

	for (const mailbox of accessible) {
		const address = `${mailbox.localPart}@${mailbox.hostname}`;
		const accountId = encodeMailboxRef({
			kind: "account",
			mailboxId: mailbox.id,
		});
		const accountCounts = counts.get(accountId) ?? { total: 0, unread: 0 };
		list.push({
			id: accountId,
			isSubscribed: true,
			myRights: rights(mailbox, true),
			name: mailbox.displayName
				? `${mailbox.displayName} <${address}>`
				: address,
			parentId: null,
			role: null,
			sortOrder: sortBase,
			totalEmails: accountCounts.total,
			totalThreads: accountCounts.total,
			unreadEmails: accountCounts.unread,
			unreadThreads: accountCounts.unread,
		});
		for (const role of SYSTEM_ROLES) {
			const id = encodeMailboxRef({
				kind: "role",
				mailboxId: mailbox.id,
				role,
			});
			const c = counts.get(id) ?? { total: 0, unread: 0 };
			list.push({
				id,
				isSubscribed: true,
				myRights: rights(mailbox, true),
				name: ROLE_NAMES[role],
				parentId: accountId,
				role,
				sortOrder: sortBase + ROLE_ORDER[role],
				totalEmails: c.total,
				totalThreads: c.total,
				unreadEmails: role === "inbox" ? c.unread : 0,
				unreadThreads: role === "inbox" ? c.unread : 0,
			});
		}
		for (const folder of foldersByMailbox.get(mailbox.id) ?? []) {
			const id = encodeMailboxRef({
				folderId: folder.id,
				kind: "folder",
				mailboxId: mailbox.id,
			});
			const c = counts.get(id) ?? { total: 0, unread: 0 };
			list.push({
				id,
				isSubscribed: true,
				myRights: rights(mailbox, false),
				name: folder.name,
				parentId: accountId,
				role: null,
				sortOrder: sortBase + 10,
				totalEmails: c.total,
				totalThreads: c.total,
				unreadEmails: c.unread,
				unreadThreads: c.unread,
			});
		}
		sortBase += 100;
	}
	return list;
}

export function pick(
	item: Record<string, unknown>,
	properties: string[] | null | undefined
): Record<string, unknown> {
	if (!properties) {
		return item;
	}
	const result: Record<string, unknown> = { id: item.id };
	for (const key of properties) {
		if (key in item) {
			result[key] = item[key];
		}
	}
	return result;
}

export function ensureJmapError(error: unknown): never {
	if (error instanceof JmapError) {
		throw error;
	}
	throw error;
}

export const mailboxGet: JmapMethodHandler = async (ctx, args) => {
	const all = await buildAllMailboxes(ctx);
	const ids = args.ids as string[] | null | undefined;
	const properties = args.properties as string[] | null | undefined;
	const wanted = ids
		? all.filter((item) => ids.includes(item.id as string))
		: all;
	const found = new Set(wanted.map((item) => item.id as string));
	return {
		accountId: ctx.accountId,
		list: wanted.map((item) => pick(item, properties)),
		notFound: ids ? ids.filter((id) => !found.has(id)) : [],
		state: await getMailboxState(ctx),
	};
};

export const mailboxQuery: JmapMethodHandler = async (ctx, args) => {
	const all = await buildAllMailboxes(ctx);
	const filter = (args.filter ?? {}) as {
		parentId?: string | null;
		name?: string;
		role?: string | null;
		hasAnyRole?: boolean;
	};
	let rows = all;
	if (filter.parentId !== undefined) {
		rows = rows.filter((item) => item.parentId === filter.parentId);
	}
	if (filter.name) {
		rows = rows.filter((item) =>
			String(item.name)
				.toLowerCase()
				.includes(requireValue(filter.name).toLowerCase())
		);
	}
	if (filter.role !== undefined) {
		rows = rows.filter((item) => item.role === filter.role);
	}
	if (filter.hasAnyRole !== undefined) {
		rows = rows.filter((item) => (item.role !== null) === filter.hasAnyRole);
	}
	rows = [...rows].toSorted(
		(a, b) => Number(a.sortOrder) - Number(b.sortOrder)
	);
	const position = Math.max(Number(args.position ?? 0), 0);
	const limit =
		args.limit === null || args.limit === undefined
			? rows.length
			: Math.max(Number(args.limit), 0);
	return {
		accountId: ctx.accountId,
		canCalculateChanges: false,
		ids: rows.slice(position, position + limit).map((item) => item.id),
		position,
		queryState: await getMailboxState(ctx),
		total: rows.length,
	};
};

export const mailboxChanges: JmapMethodHandler = async (ctx, args) =>
	await mailboxChangesSince(ctx, args);

/** Folders can be created, renamed and removed; system mailboxes cannot. */
export const mailboxSet: JmapMethodHandler = async (ctx, args) => {
	const oldState = await getMailboxState(ctx);
	if (args.ifInState && args.ifInState !== oldState) {
		return { type: "stateMismatch" };
	}
	const accessible = await listJmapMailboxes(ctx);
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
			const parent =
				typeof value.parentId === "string"
					? decodeMailboxRef(value.parentId)
					: null;
			const name = typeof value.name === "string" ? value.name.trim() : "";
			const mailbox =
				parent && accessible.find((row) => row.id === parent.mailboxId);
			if (
				!parent ||
				parent.kind !== "account" ||
				!mailbox ||
				mailbox.permission !== "full_access"
			) {
				notCreated[creationId] = {
					description: "Folders live directly under a mailbox",
					properties: ["parentId"],
					type: "invalidProperties",
				};
				return;
			}
			if (!name || name.length > 80) {
				notCreated[creationId] = {
					properties: ["name"],
					type: "invalidProperties",
				};
				return;
			}
			const id = newId("fld");
			try {
				await ctx.db
					.insert(folders)
					.values({ id, mailboxId: mailbox.id, name, userId: mailbox.userId });
			} catch {
				notCreated[creationId] = {
					description: "A folder with that name already exists",
					properties: ["name"],
					type: "invalidProperties",
				};
				return;
			}
			const jmapId = encodeMailboxRef({
				folderId: id,
				kind: "folder",
				mailboxId: mailbox.id,
			});
			ctx.createdIds[creationId] = jmapId;
			created[creationId] = {
				id: jmapId,
				isSubscribed: true,
				role: null,
				sortOrder: 0,
				totalEmails: 0,
				totalThreads: 0,
				unreadEmails: 0,
				unreadThreads: 0,
			};
		};
		await applyCreation();
	}

	for (const [id, patch] of Object.entries(
		(args.update ?? {}) as Record<string, Record<string, unknown>>
	)) {
		const applyUpdate = async () => {
			const ref = decodeMailboxRef(id);
			const mailbox = ref && accessible.find((row) => row.id === ref.mailboxId);
			if (!ref || !mailbox) {
				notUpdated[id] = { type: "notFound" };
				return;
			}
			const keys = Object.keys(patch).filter(
				(key) => key !== "isSubscribed" && key !== "sortOrder"
			);
			if (ref.kind !== "folder") {
				if (keys.length) {
					notUpdated[id] = {
						description: "System mailboxes cannot be changed",
						type: "forbidden",
					};
				}
				if (!keys.length) {
					updated[id] = null;
				}
				return;
			}
			if (keys.some((key) => key !== "name")) {
				notUpdated[id] = {
					properties: keys.filter((key) => key !== "name"),
					type: "invalidProperties",
				};
				return;
			}
			if (typeof patch.name === "string" && patch.name.trim()) {
				await ctx.db
					.update(folders)
					.set({ name: patch.name.trim() })
					.where(
						and(eq(folders.id, ref.folderId), eq(folders.mailboxId, mailbox.id))
					);
			}
			updated[id] = null;
		};
		await applyUpdate();
	}

	for (const id of (args.destroy ?? []) as string[]) {
		const applyDestruction = async () => {
			const ref = decodeMailboxRef(id);
			const mailbox = ref && accessible.find((row) => row.id === ref.mailboxId);
			if (!ref || !mailbox) {
				notDestroyed[id] = { type: "notFound" };
				return;
			}
			if (ref.kind !== "folder" || mailbox.permission !== "full_access") {
				notDestroyed[id] = { type: "forbidden" };
				return;
			}
			if (args.onDestroyRemoveEmails) {
				await ctx.db
					.update(messages)
					.set({ folderId: null, status: "trash" })
					.where(eq(messages.folderId, ref.folderId));
			} else {
				const [inUse] = await ctx.db
					.select({ n: count() })
					.from(messages)
					.where(
						and(
							eq(messages.folderId, ref.folderId),
							isNull(messages.snoozedUntil)
						)
					);
				if ((inUse?.n ?? 0) > 0) {
					notDestroyed[id] = { type: "mailboxHasEmail" };
					return;
				}
			}
			await ctx.db
				.delete(folders)
				.where(
					and(eq(folders.id, ref.folderId), eq(folders.mailboxId, mailbox.id))
				);
			destroyed.push(id);
		};
		await applyDestruction();
	}

	return {
		accountId: ctx.accountId,
		created,
		destroyed,
		newState: await getMailboxState(ctx),
		notCreated,
		notDestroyed,
		notUpdated,
		oldState,
		updated,
	};
};
