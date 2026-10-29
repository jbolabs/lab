import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { upsertContactFromAddress } from "@/lib/contacts/service";
import { storeMessageAttachments } from "@/lib/email/attachments";
import { deleteMessageWithObjects } from "@/lib/email/message-cleanup";
import { buildSnippet, parseRawMime } from "@/lib/email/parse";
import { resolveThreadId } from "@/lib/email/threading";
import { newId } from "@/lib/ids";

import { getImportMessagePlacement } from "./destination";
import type { ImportDestination } from "./destination-types";
import type { ImportMailboxResult, ImportMessageInput } from "./types";

async function importMessageToMailbox(
	env: CloudflareEnv,
	input: {
		userId: string;
		mailboxId: string;
		destination: ImportDestination;
		filename: string;
		raw: ArrayBuffer;
	}
): Promise<boolean> {
	const parsed = await parseRawMime(input.raw);
	const db = getDb(env);
	const providerMessageId =
		parsed.messageId ?? `import:${input.filename}:${input.raw.byteLength}`;

	const [existing] = await db
		.select({ id: messages.id })
		.from(messages)
		.where(
			and(
				eq(messages.mailboxId, input.mailboxId),
				eq(messages.providerMessageId, providerMessageId)
			)
		)
		.limit(1);
	if (existing) {
		return false;
	}

	const messageId = newId("msg");
	const rawR2Key = `imports/${messageId}.eml`;
	const fromAddr = parsed.fromAddr ?? "unknown";
	const toAddr = parsed.toAddr ?? "";
	const createdAt = parsed.date ?? new Date();
	const placement = getImportMessagePlacement(input.destination);

	await db.insert(messages).values({
		ccAddr: parsed.ccAddr,
		createdAt,
		direction: placement.direction,
		folderId: placement.folderId,
		fromAddr,
		htmlBody: parsed.html,
		id: messageId,
		inReplyTo: parsed.inReplyTo,
		mailboxId: input.mailboxId,
		providerMessageId,
		rawR2Key,
		read: placement.direction === "outbound",
		references: parsed.references.length ? parsed.references.join(" ") : null,
		replyTo: parsed.replyTo,
		snippet: buildSnippet(parsed.text, parsed.html),
		status: placement.status,
		subject: parsed.subject,
		textBody: parsed.text,
		threadId: await resolveThreadId(db, {
			inReplyTo: parsed.inReplyTo,
			mailboxId: input.mailboxId,
			messageId: parsed.messageId,
			references: parsed.references,
		}),
		toAddr,
		userId: input.userId,
	});

	try {
		await env.BUCKET.put(rawR2Key, input.raw, {
			httpMetadata: { contentType: "message/rfc822" },
		});
		await storeMessageAttachments(env, messageId, parsed.attachments, {
			validate: false,
		});
		const contactAddress =
			placement.direction === "outbound" ? toAddr : fromAddr;
		await upsertContactFromAddress(env, {
			address: contactAddress,
			source: placement.direction === "outbound" ? "outbound" : "inbound",
			userId: input.userId,
		});
	} catch (error) {
		await deleteMessageWithObjects(env, db, messageId, rawR2Key);
		throw error;
	}

	return true;
}

export async function importMessagesToMailbox(
	env: CloudflareEnv,
	input: {
		userId: string;
		mailboxId: string;
		destination: ImportDestination;
		messages: ImportMessageInput[];
	}
): Promise<ImportMailboxResult> {
	const result: ImportMailboxResult = { errors: [], imported: 0, skipped: 0 };
	for (const message of input.messages) {
		try {
			const imported = await importMessageToMailbox(env, {
				destination: input.destination,
				filename: message.filename,
				mailboxId: input.mailboxId,
				raw: message.raw,
				userId: input.userId,
			});
			if (imported) {
				result.imported += 1;
			} else {
				result.skipped += 1;
			}
		} catch (error) {
			result.skipped += 1;
			result.errors.push(
				`${message.filename}: ${error instanceof Error ? error.message : "Import failed"}`
			);
		}
	}
	return result;
}
