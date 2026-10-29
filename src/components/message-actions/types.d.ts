import type { LucideProps } from "lucide-react";
import { IconNode } from "lucide-react";
import type { ComponentType } from "react";

import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import type { Message, MessageDirection } from "@/hooks/types";
import type { TranslationKey } from "@/lib/i18n/types";

export interface MessageActionsProps {
	messageId: string;
	mailboxId: string | null;
	senderAddress: string;
	direction: MessageDirection;
	status: string;
	read: boolean;
	unsubscribeUrl?: string | null;
	subject?: string | null;
	bodyText?: string | null;
	ownAddress?: string | null;
	/** Every address the mailbox can send as; used to drop "me" from reply-all. */
	ownAddresses?: string[];
	/** Recipient and threading headers of the message being acted on. */
	message?: ReplyableMessage;
	/** Needed by Forward, which quotes the original header block. */
	messageMeta?: Pick<Message, "id" | "subject" | "createdAt">;
	bodyHtml?: string | null;
}

export interface MessageSnoozeDialogProps {
	messageId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export interface ForwardDraftInput {
	mailboxId: string | null;
	ownAddress?: string | null;
	message: ReplyableMessage & Pick<Message, "id" | "subject" | "createdAt">;
	bodyText?: string | null;
	bodyHtml?: string | null;
}

export type SingleMessageAction =
	| BulkMessageAction
	| "reply"
	| "replyAll"
	| "forward";

export type ReplyMode = "reply" | "replyAll";

export type ReplyableMessage = Pick<
	Message,
	| "direction"
	| "fromAddr"
	| "toAddr"
	| "ccAddr"
	| "replyTo"
	| "providerMessageId"
	| "references"
	| "threadId"
>;

export interface ReplyRecipients {
	to: string[];
	cc: string[];
}

export interface ReplyDraftInput {
	mailboxId: string | null;
	senderAddress: string;
	ownAddress?: string | null;
	subject?: string | null;
	bodyText?: string | null;
	bodyHtml?: string | null;
	sentAt?: string | null;
	recipients: ReplyRecipients;
	threading?: {
		inReplyTo: string | null;
		references: string | null;
		threadId: string | null;
	};
}

export interface TrashSenderRuleInput {
	mailboxId: string;
	senderAddress: string;
}

export interface BlockMessageContactInput {
	mailboxId: string;
	senderAddress: string;
}

export interface MoveMessageActionItem {
	action: BulkMessageAction;
	labelKey: TranslationKey;
	icon: ComponentType<LucideProps & { "data-icon"?: string }>;
}
