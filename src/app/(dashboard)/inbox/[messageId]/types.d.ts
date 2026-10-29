import type { Message } from "@/hooks/types";
import type { ReplyContentParts } from "@/lib/email/reply-content-types";

export interface MessageDetailResponse {
	message?: Message;
	body?: {
		htmlBody: string | null;
		textBody: string | null;
	} | null;
	attachments?: MessageAttachment[];
	unsubscribeUrl?: string | null;
	/** ISO time a queued message is waiting to be sent, when it is a scheduled send. */
	scheduledAt?: string | null;
	error?: string;
}

export type LoadedMessageData = MessageDetailResponse & {
	message: NonNullable<MessageDetailResponse["message"]>;
};

export interface MessageAttachment {
	contentId: string | null;
	disposition: "attachment" | "inline";
	filename: string;
	id: string;
	messageId: string;
	size: number;
	type: string;
}

export type MessageBodyDisplay = ReplyContentParts & {
	htmlBody: string | null;
	/** Quoted/forwarded HTML a Mailflare composer folded under the message, shown collapsed. */
	quotedHtml: string | null;
	hasQuotedContent: boolean;
};
