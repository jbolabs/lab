import type { ThreadMessage } from "@/hooks/types";

export interface ConversationThreadProps {
	/** The message the reader is currently viewing; it is rendered by the page, not here. */
	currentMessageId: string;
	/** Which side of the current message to render. */
	position: "before" | "after";
	messages: ThreadMessage[];
	mailboxId: string | null;
	currentAccountName?: string;
	ownAddress?: string | null;
	ownAddresses?: string[];
	latestMessagesFirst: boolean;
	expandedAll: boolean;
	onExpandedAllChange: (expanded: boolean) => void;
	showFullRecipientAddresses?: boolean;
}

export interface ConversationMessageCardProps {
	message: ThreadMessage;
	mailboxId: string | null;
	currentAccountName?: string;
	ownAddress?: string | null;
	ownAddresses?: string[];
	defaultExpanded?: boolean;
	showFullRecipientAddresses?: boolean;
}

export interface UseMessageThreadResult {
	messages: ThreadMessage[];
	loading: boolean;
}
