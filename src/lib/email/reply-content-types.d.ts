export type PreviousMessageDirection = "received" | "sent";

export interface QuotedEmailContent {
	dateLine: string;
	direction: PreviousMessageDirection;
	content: string;
	quotedContent: QuotedEmailContent[];
}

export interface ReplyContentParts {
	latestContent: string;
	quotedContent: QuotedEmailContent[];
}

export interface SplitReplyContentOptions {
	ownAddress?: string;
}
