import { and, inArray, isNull } from "drizzle-orm";

import type { messages } from "@/db/schema";
import { messageAttachments } from "@/db/schema";
import {
	parseEmailAddressParts,
	splitEmailAddressList,
} from "@/lib/email/address";
import { htmlToReadableText } from "@/lib/email/reply-content-utils";
import { requireValue } from "@/lib/require-value";

import { KEYWORD_DRAFT, KEYWORD_FLAGGED, KEYWORD_SEEN } from "./constants";
import {
	attachmentBlobId,
	encodeMailboxRef,
	messageBlobId,
	statusToRole,
} from "./ids";
import type { EmailAddressObject, EmailBodyPart, JmapContext } from "./types";

export function toAddressObjects(
	value: string | null | undefined
): EmailAddressObject[] | null {
	const entries = splitEmailAddressList(value);
	if (entries.length === 0) {
		return null;
	}
	return entries.map((entry) => {
		const parts = parseEmailAddressParts(entry);
		return { email: parts.address, name: parts.name };
	});
}

type MessageRow = typeof messages.$inferSelect;

export function mailboxIdsFor(row: MessageRow): Record<string, boolean> {
	if (!row.mailboxId) {
		return {};
	}
	if (row.folderId) {
		return {
			[encodeMailboxRef({
				folderId: row.folderId,
				kind: "folder",
				mailboxId: row.mailboxId,
			})]: true,
		};
	}
	const role = statusToRole(row.status);
	return role
		? {
				[encodeMailboxRef({
					kind: "role",
					mailboxId: row.mailboxId,
					role,
				})]: true,
			}
		: {};
}

export function keywordsFor(row: MessageRow): Record<string, boolean> {
	const keywords: Record<string, boolean> = {};
	if (row.read || row.direction === "outbound") {
		keywords[KEYWORD_SEEN] = true;
	}
	if (row.starred) {
		keywords[KEYWORD_FLAGGED] = true;
	}
	if (row.status === "draft") {
		keywords[KEYWORD_DRAFT] = true;
	}
	return keywords;
}

export function threadIdFor(row: Pick<MessageRow, "id" | "threadId">): string {
	return row.threadId ?? row.id;
}

function stripBrackets(value: string | null): string | null {
	const trimmed = value?.trim().replaceAll(/^<|>$/gu, "");
	return trimmed || null;
}

function bodyPart(partId: string, type: string, size: number): EmailBodyPart {
	return {
		blobId: null,
		charset: "utf-8",
		cid: null,
		disposition: null,
		headers: [],
		language: null,
		location: null,
		name: null,
		partId,
		size,
		type,
	};
}

type AttachmentRow = typeof messageAttachments.$inferSelect;

function attachmentPart(attachment: AttachmentRow): EmailBodyPart {
	return {
		blobId: attachmentBlobId(attachment.id),
		charset: null,
		cid: attachment.contentId
			? attachment.contentId.replaceAll(/^<|>$/gu, "")
			: null,
		disposition: attachment.disposition,
		headers: [],
		language: null,
		location: null,
		name: attachment.filename,
		partId: null,
		size: attachment.size,
		type: attachment.contentType,
	};
}

/**
 * The Email object (RFC 8621 §4.1) from a stored row. Bodies are the parsed
 * text and HTML Mailflare keeps; attachments become parts with blob ids the
 * download endpoint understands. Property filtering happens in the caller.
 */
export function buildEmailObject(
	row: MessageRow,
	attachments: AttachmentRow[],
	options: { fetchBodies: boolean; maxBodyValueBytes: number }
) {
	const text = row.textBody ?? "";
	const html = row.htmlBody ?? "";
	const textSize = new TextEncoder().encode(text).length;
	const htmlSize = new TextEncoder().encode(html).length;
	const textPart = text ? bodyPart("1", "text/plain", textSize) : null;
	const htmlPart = html ? bodyPart("2", "text/html", htmlSize) : null;
	const inline = attachments.filter((item) => item.disposition === "inline");
	const attached = attachments.filter((item) => item.disposition !== "inline");

	const bodyParts = [textPart, htmlPart].filter(
		(part): part is EmailBodyPart => !!part
	);
	const alternative: EmailBodyPart | null =
		bodyParts.length > 1
			? {
					blobId: null,
					charset: null,
					cid: null,
					disposition: null,
					language: null,
					location: null,
					name: null,
					partId: null,
					size: textSize + htmlSize,
					subParts: bodyParts,
					type: "multipart/alternative",
				}
			: (bodyParts[0] ?? bodyPart("1", "text/plain", 0));
	const structure: EmailBodyPart =
		attachments.length > 0
			? {
					blobId: null,
					charset: null,
					cid: null,
					disposition: null,
					language: null,
					location: null,
					name: null,
					partId: null,
					size: 0,
					subParts: [
						alternative,
						...inline.map(attachmentPart),
						...attached.map(attachmentPart),
					],
					type: "multipart/mixed",
				}
			: alternative;

	const bodyValues: Record<
		string,
		{ value: string; isEncodingProblem: boolean; isTruncated: boolean }
	> = {};
	if (options.fetchBodies) {
		const clip = (value: string) => {
			const limit = options.maxBodyValueBytes;
			if (!limit || value.length <= limit) {
				return { isEncodingProblem: false, isTruncated: false, value };
			}
			return {
				isEncodingProblem: false,
				isTruncated: true,
				value: value.slice(0, limit),
			};
		};
		if (textPart) {
			bodyValues["1"] = clip(text);
		}
		if (htmlPart) {
			bodyValues["2"] = clip(html);
		}
	}

	const size =
		textSize +
		htmlSize +
		attachments.reduce((total, item) => total + item.size, 0);
	const preview = (row.snippet ?? htmlToReadableText(html) ?? text)
		.replaceAll(/\s+/gu, " ")
		.trim()
		.slice(0, 256);
	const references = row.references
		? row.references.split(/\s+/u).filter(Boolean)
		: null;
	const from = toAddressObjects(row.fromAddr);
	const sentAt = row.createdAt.toISOString();

	return {
		attachments: [...inline, ...attached].map(attachmentPart),
		bcc: toAddressObjects(row.bccAddr),
		blobId: messageBlobId(row.id),
		bodyStructure: structure,
		bodyValues,
		cc: toAddressObjects(row.ccAddr),
		from,
		hasAttachment: attached.length > 0,
		htmlBody: (() => {
			if (htmlPart) {
				return [htmlPart];
			}
			if (textPart) {
				return [textPart];
			}
			return [];
		})(),
		id: row.id,
		inReplyTo: row.inReplyTo ? [row.inReplyTo] : null,
		keywords: keywordsFor(row),
		mailboxIds: mailboxIdsFor(row),
		messageId: stripBrackets(row.providerMessageId)
			? [requireValue(stripBrackets(row.providerMessageId))]
			: null,
		preview,
		receivedAt: sentAt,
		references,
		replyTo: toAddressObjects(row.replyTo),
		sender: from,
		sentAt,
		size,
		subject: row.subject,
		textBody: (() => {
			if (textPart) {
				return [textPart];
			}
			if (htmlPart) {
				return [htmlPart];
			}
			return [];
		})(),
		threadId: threadIdFor(row),
		to: toAddressObjects(row.toAddr),
	};
}

/** Attachment rows for many messages in one query, keyed by message id. */
export async function loadAttachmentsByMessage(
	ctx: JmapContext,
	messageIds: string[]
): Promise<Map<string, AttachmentRow[]>> {
	const result = new Map<string, AttachmentRow[]>();
	if (messageIds.length === 0) {
		return result;
	}
	// D1 caps bound parameters per query at 100; this predicate binds only
	// message ids, so slice at exactly 100 (mirroring the revision query).
	// Dedupe so a repeated id cannot append its attachments twice.
	const unique = [...new Set(messageIds)];
	for (let offset = 0; offset < unique.length; offset += 100) {
		const rows = await ctx.db
			.select()
			.from(messageAttachments)
			.where(
				and(
					inArray(
						messageAttachments.messageId,
						unique.slice(offset, offset + 100)
					),
					isNull(messageAttachments.trashedAt)
				)
			);
		for (const row of rows) {
			const list = result.get(row.messageId) ?? [];
			list.push(row);
			result.set(row.messageId, list);
		}
	}
	return result;
}

/** `header:Name[:asForm]` properties, answered from stored fields; unknown headers are null. */
export function resolveHeaderProperty(
	row: MessageRow,
	property: string
): unknown {
	const [, name, form] = property.split(":");
	const lower = (name ?? "").toLowerCase();
	const raw = (() => {
		switch (lower) {
			case "subject": {
				return row.subject;
			}
			case "from": {
				return row.fromAddr;
			}
			case "to": {
				return row.toAddr;
			}
			case "cc": {
				return row.ccAddr;
			}
			case "bcc": {
				return row.bccAddr;
			}
			case "message-id": {
				return row.providerMessageId;
			}
			case "in-reply-to": {
				return row.inReplyTo ? `<${row.inReplyTo}>` : null;
			}
			case "references": {
				return row.references
					? row.references
							.split(/\s+/u)
							.map((id) => `<${id}>`)
							.join(" ")
					: null;
			}
			case "date": {
				return row.createdAt.toUTCString();
			}
			default: {
				return null;
			}
		}
	})();
	if (raw === null || raw === undefined) {
		return null;
	}
	switch ((form ?? "asRaw").toLowerCase()) {
		case "asaddresses": {
			return toAddressObjects(raw);
		}
		case "asmessageids": {
			return raw
				.split(/\s+/u)
				.map((id) => id.replaceAll(/^<|>$/gu, ""))
				.filter(Boolean);
		}
		case "asdate": {
			return row.createdAt.toISOString();
		}
		case "astext": {
			return raw;
		}
		default: {
			return ` ${raw}`;
		}
	}
}
