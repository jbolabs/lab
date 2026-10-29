import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";

import { getDb } from "@/db";
import { messageAttachments, messages } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/types";
import {
	getContactAvatarMap,
	getContactDisplayNameMap,
} from "@/lib/contacts/service";
import {
	getFirstEmailAddressEntry,
	normalizeEmailAddress,
} from "@/lib/email/address";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";

/**
 * The conversation a message belongs to: every stored message in the same
 * mailbox sharing its thread id, oldest first. Drafts and trashed messages are
 * left out, matching what threaded clients show. Bodies come along so the
 * reader can expand any message without another round trip.
 */
/** The R2 key is an internal pointer and never leaves the server. */
function withoutRawKey<T extends { rawR2Key: string | null }>(
	row: T
): Omit<T, "rawR2Key"> {
	const copy: Partial<T> = { ...row };
	delete copy.rawR2Key;
	return copy as Omit<T, "rawR2Key">;
}

export async function getMessageThreadForUser(
	env: CloudflareEnv,
	user: SessionUser,
	messageId: string
) {
	const db = getDb(env);
	const [message] = await db
		.select({
			mailboxId: messages.mailboxId,
			threadId: messages.threadId,
			userId: messages.userId,
		})
		.from(messages)
		.where(eq(messages.id, messageId))
		.limit(1);
	if (!message?.mailboxId) {
		return null;
	}
	const access = await getMailboxAccessLevel(db, user, message.mailboxId);
	if (!access?.canRead) {
		return null;
	}

	const rows = message.threadId
		? await db
				.select()
				.from(messages)
				.where(
					and(
						eq(messages.mailboxId, message.mailboxId),
						eq(messages.threadId, message.threadId),
						notInArray(messages.status, ["draft", "trash"])
					)
				)
				.orderBy(asc(messages.createdAt))
				.limit(200)
		: await db
				.select()
				.from(messages)
				.where(eq(messages.id, messageId))
				.limit(1);

	const ids = rows.map((row) => row.id);
	const attachmentRows = ids.length
		? await db
				.select({
					contentId: messageAttachments.contentId,
					disposition: messageAttachments.disposition,
					filename: messageAttachments.filename,
					id: messageAttachments.id,
					messageId: messageAttachments.messageId,
					size: messageAttachments.size,
					type: messageAttachments.contentType,
				})
				.from(messageAttachments)
				.where(
					and(
						inArray(messageAttachments.messageId, ids),
						isNull(messageAttachments.trashedAt)
					)
				)
		: [];
	const attachmentsByMessage = new Map<string, typeof attachmentRows>();
	for (const attachment of attachmentRows) {
		const list = attachmentsByMessage.get(attachment.messageId) ?? [];
		list.push(attachment);
		attachmentsByMessage.set(attachment.messageId, list);
	}

	const contactMap = await getContactDisplayNameMap(
		env,
		message.userId,
		rows.flatMap((row) => [row.fromAddr, getFirstEmailAddressEntry(row.toAddr)])
	);
	const contactAvatarMap = await getContactAvatarMap(
		env,
		message.userId,
		rows.map((row) => row.fromAddr)
	);

	return {
		messages: rows.map((row) => ({
			...withoutRawKey(row),
			attachments: attachmentsByMessage.get(row.id) ?? [],
			fromContactHasAvatar:
				contactAvatarMap.get(normalizeEmailAddress(row.fromAddr)) ?? false,
			fromContactName:
				contactMap.get(normalizeEmailAddress(row.fromAddr)) ?? null,
			toContactName:
				contactMap.get(
					normalizeEmailAddress(getFirstEmailAddressEntry(row.toAddr))
				) ?? null,
		})),
		threadId: message.threadId,
	};
}
