import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { messageAttachments, messages } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/types";
import { newId } from "@/lib/ids";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";

import type {
	AttachmentContent,
	AttachmentMetadata,
	StoredAttachment,
} from "./attachment-types";

export function decodeBase64Content(content: string): ArrayBuffer {
	const binary = atob(content.replaceAll(/\s/gu, ""));
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		// oxlint-disable-next-line unicorn/prefer-code-point -- Binary encoding and persisted hashes operate on UTF-16 code units or bytes; code points would change their representation.
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes.buffer;
}

export function normalizeAttachmentContent(
	content: ArrayBuffer | Uint8Array | string,
	// oxlint-disable-next-line unicorn/text-encoding-identifier-case -- PostalMime uses utf8 as its attachment encoding discriminator.
	encoding?: "base64" | "utf8"
): ArrayBuffer {
	if (content instanceof ArrayBuffer) {
		return content;
	}
	if (content instanceof Uint8Array) {
		return content.buffer.slice(
			content.byteOffset,
			content.byteOffset + content.byteLength
		) as ArrayBuffer;
	}
	if (encoding === "base64") {
		return decodeBase64Content(content);
	}
	return new TextEncoder().encode(content).buffer;
}

function sanitizeFilename(filename: string): string {
	const normalized = filename.trim().replaceAll(/[/\\\0]/gu, "_");
	return normalized || "attachment";
}

export const MAX_ATTACHMENT_COUNT = 10;

export const MAX_ATTACHMENT_SIZE = 25_000_000;

export const MAX_TOTAL_ATTACHMENT_SIZE = 25_000_000;

export function validateAttachments(attachments: AttachmentContent[]): void {
	if (attachments.length > MAX_ATTACHMENT_COUNT) {
		throw new Error(
			`A message can include at most ${MAX_ATTACHMENT_COUNT} attachments`
		);
	}

	let totalSize = 0;
	for (const attachment of attachments) {
		const size = attachment.content.byteLength;
		if (size > MAX_ATTACHMENT_SIZE) {
			throw new Error(
				`${attachment.filename} exceeds the 25 MB attachment limit`
			);
		}
		totalSize += size;
	}

	if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE) {
		throw new Error("Attachments exceed the 25 MB total limit");
	}
}

export async function storeMessageAttachments(
	env: CloudflareEnv,
	messageId: string,
	attachments: AttachmentContent[],
	options?: { validate?: boolean }
): Promise<StoredAttachment[]> {
	if (options?.validate !== false) {
		validateAttachments(attachments);
	}
	const db = getDb(env);
	const stored: StoredAttachment[] = [];

	try {
		for (const attachment of attachments) {
			const id = newId("att");
			const filename = sanitizeFilename(attachment.filename);
			const r2Key = `attachments/${messageId}/${id}/${filename}`;
			const disposition = attachment.disposition ?? "attachment";

			await env.BUCKET.put(r2Key, attachment.content, {
				customMetadata: { filename, messageId },
				httpMetadata: { contentType: attachment.type },
			});
			stored.push({
				contentId: attachment.contentId ?? null,
				disposition,
				filename,
				id,
				messageId,
				r2Key,
				size: attachment.content.byteLength,
				type: attachment.type,
			});
			await db.insert(messageAttachments).values({
				contentId: attachment.contentId ?? null,
				contentType: attachment.type,
				disposition,
				filename,
				id,
				messageId,
				r2Key,
				size: attachment.content.byteLength,
			});
		}
	} catch (error) {
		await Promise.all(
			stored.map((attachment) => env.BUCKET.delete(attachment.r2Key))
		);
		throw error;
	}

	return stored;
}

/**
 * Duplicate a message's attachments onto another message (a forward draft).
 * R2 keys are unique per row, so the objects are copied rather than shared,
 * which keeps deleting the draft from touching the original.
 */
export async function copyMessageAttachments(
	env: CloudflareEnv,
	fromMessageId: string,
	toMessageId: string
): Promise<AttachmentMetadata[]> {
	const db = getDb(env);
	const rows = await db
		.select()
		.from(messageAttachments)
		.where(
			and(
				eq(messageAttachments.messageId, fromMessageId),
				isNull(messageAttachments.trashedAt)
			)
		);
	const copied: AttachmentMetadata[] = [];
	for (const row of rows) {
		const object = await env.BUCKET.get(row.r2Key);
		if (!object) {
			continue;
		}
		const id = newId("att");
		const r2Key = `attachments/${toMessageId}/${id}/${row.filename}`;
		await env.BUCKET.put(r2Key, await object.arrayBuffer(), {
			customMetadata: { filename: row.filename, messageId: toMessageId },
			httpMetadata: { contentType: row.contentType },
		});
		await db.insert(messageAttachments).values({
			contentId: row.contentId,
			contentType: row.contentType,
			disposition: row.disposition,
			filename: row.filename,
			id,
			messageId: toMessageId,
			r2Key,
			size: row.size,
		});
		copied.push({
			contentId: row.contentId,
			disposition: row.disposition as "attachment" | "inline",
			filename: row.filename,
			id,
			messageId: toMessageId,
			size: row.size,
			type: row.contentType,
		});
	}
	return copied;
}

/** Attachments with their bytes, for handing a draft's files to the send path. */
export async function loadMessageAttachmentContents(
	env: CloudflareEnv,
	messageId: string
): Promise<AttachmentContent[]> {
	const db = getDb(env);
	const rows = await db
		.select()
		.from(messageAttachments)
		.where(
			and(
				eq(messageAttachments.messageId, messageId),
				isNull(messageAttachments.trashedAt)
			)
		);
	const result: AttachmentContent[] = [];
	for (const row of rows) {
		const object = await env.BUCKET.get(row.r2Key);
		if (!object) {
			continue;
		}
		result.push({
			content: await object.arrayBuffer(),
			contentId: row.contentId,
			disposition: row.disposition as "attachment" | "inline",
			filename: row.filename,
			storageId: row.id,
			type: row.contentType,
		});
	}
	return result;
}

/** Remove one attachment (row and object). Returns false when it is not on that message. */
export async function deleteMessageAttachment(
	env: CloudflareEnv,
	messageId: string,
	attachmentId: string
): Promise<boolean> {
	const db = getDb(env);
	const [row] = await db
		.select({ r2Key: messageAttachments.r2Key })
		.from(messageAttachments)
		.where(
			and(
				eq(messageAttachments.id, attachmentId),
				eq(messageAttachments.messageId, messageId)
			)
		)
		.limit(1);
	if (!row) {
		return false;
	}
	await db
		.delete(messageAttachments)
		.where(eq(messageAttachments.id, attachmentId));
	await env.BUCKET.delete(row.r2Key);
	return true;
}

/** Remove every attachment object of a message; the rows cascade with the message row. */
export async function deleteMessageAttachmentObjects(
	env: CloudflareEnv,
	messageId: string
): Promise<void> {
	const db = getDb(env);
	const rows = await db
		.select({ r2Key: messageAttachments.r2Key })
		.from(messageAttachments)
		.where(eq(messageAttachments.messageId, messageId));
	await Promise.all(rows.map((row) => env.BUCKET.delete(row.r2Key)));
}

export async function listMessageAttachments(
	env: CloudflareEnv,
	messageId: string
): Promise<AttachmentMetadata[]> {
	const db = getDb(env);
	const rows = await db
		.select()
		.from(messageAttachments)
		.where(
			and(
				eq(messageAttachments.messageId, messageId),
				isNull(messageAttachments.trashedAt)
			)
		);

	return rows.map((attachment) => ({
		contentId: attachment.contentId,
		disposition: attachment.disposition as "attachment" | "inline",
		filename: attachment.filename,
		id: attachment.id,
		messageId: attachment.messageId,
		size: attachment.size,
		type: attachment.contentType,
	}));
}

export async function getAttachmentForUser(
	env: CloudflareEnv,
	user: SessionUser,
	messageId: string,
	attachmentId: string
) {
	const db = getDb(env);
	const [message] = await db
		.select()
		.from(messages)
		.where(eq(messages.id, messageId))
		.limit(1);
	if (!message) {
		return null;
	}

	if (message.mailboxId) {
		const access = await getMailboxAccessLevel(db, user, message.mailboxId);
		if (!access?.canRead) {
			return null;
		}
	} else if (message.userId !== user.id) {
		return null;
	}

	const [attachment] = await db
		.select()
		.from(messageAttachments)
		.where(
			and(
				eq(messageAttachments.id, attachmentId),
				eq(messageAttachments.messageId, messageId),
				isNull(messageAttachments.trashedAt)
			)
		)
		.limit(1);
	if (!attachment) {
		return null;
	}

	const object = await env.BUCKET.get(attachment.r2Key);
	if (!object) {
		return null;
	}
	return { attachment, object };
}
