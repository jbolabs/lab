export interface ComposeDraft {
	id: string;
	mailboxId: string | null;
	fromAddr: string;
	toAddr: string;
	ccAddr?: string | null;
	bccAddr?: string | null;
	subject: string | null;
	textBody: string | null;
	htmlBody: string | null;
	inReplyTo?: string | null;
	references?: string | null;
	threadId?: string | null;
	/** Files already stored on the draft, e.g. carried over by Forward. */
	attachments?: ComposeStoredAttachment[];
	agent?: {
		revision: number;
		origin: "chat" | "auto" | "mcp";
		scheduledAt: string | null;
	} | null;
}

export interface ComposeStoredAttachment {
	id: string;
	filename: string;
	size: number;
	type: string;
	disposition: "attachment" | "inline";
}

/** Headers a reply draft carries so the sent message joins its conversation. */
export interface ComposeThreading {
	inReplyTo: string | null;
	references: string | null;
	threadId: string | null;
}

export interface DraftResponse {
	draft?: ComposeDraft;
	error?: string;
}

export interface ComposeAttachment {
	id: string;
	file: File;
}
