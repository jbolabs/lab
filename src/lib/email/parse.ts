import PostalMime from "postal-mime";

import {
	formatPostalAddress,
	formatPostalAddressList,
} from "@/lib/email/address";
import type { AttachmentContent } from "@/lib/email/attachment-types";
import { normalizeAttachmentContent } from "@/lib/email/attachments";
import {
	getLatestEmailContent,
	htmlToReadableText,
} from "@/lib/email/reply-content-utils";
import { normalizeMessageId, parseMessageIdList } from "@/lib/email/threading";

export interface ParsedEmail {
	subject: string | null;
	text: string | null;
	html: string | null;
	messageId: string | null;
	fromAddr: string | null;
	/** Full To header, comma-joined. */
	toAddr: string | null;
	/** Full Cc header, comma-joined. */
	ccAddr: string | null;
	/** Full Bcc header, comma-joined. Only present on mail composed locally, never on delivered mail. */
	bccAddr: string | null;
	/** Full Reply-To header, comma-joined. */
	replyTo: string | null;
	inReplyTo: string | null;
	references: string[];
	date: Date | null;
	attachments: AttachmentContent[];
}

export async function parseRawMime(raw: ArrayBuffer): Promise<ParsedEmail> {
	const email = await PostalMime.parse(raw);
	const date = email.date ? new Date(email.date) : null;
	return {
		attachments: email.attachments.map((attachment, index) => ({
			content: normalizeAttachmentContent(
				attachment.content,
				attachment.encoding
			),
			contentId: attachment.contentId ?? null,
			disposition:
				attachment.disposition === "inline" ? "inline" : "attachment",
			filename: attachment.filename ?? `attachment-${index + 1}`,
			type: attachment.mimeType || "application/octet-stream",
		})),
		bccAddr: formatPostalAddressList(email.bcc, null),
		ccAddr: formatPostalAddressList(email.cc, null),
		date: date && !Number.isNaN(date.getTime()) ? date : null,
		fromAddr: formatPostalAddress(email.from, null),
		html: email.html ?? null,
		inReplyTo: normalizeMessageId(email.inReplyTo),
		messageId: email.messageId ?? null,
		references: parseMessageIdList(email.references),
		replyTo: formatPostalAddressList(email.replyTo, null),
		subject: email.subject ?? null,
		text: email.text ?? null,
		toAddr: formatPostalAddressList(email.to, null),
	};
}

export function buildSnippet(
	text: string | null,
	html: string | null,
	max = 200
): string {
	const source = getLatestEmailContent(
		text?.trim() || htmlToReadableText(html)
	);
	return source.replaceAll(/\s+/gu, " ").trim().slice(0, max);
}
