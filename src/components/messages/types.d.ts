import type { LucideIcon } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import type { Message, MessageFolder } from "@/hooks/types";
import type { TranslationKey } from "@/lib/i18n/types";

export interface MessageFolderConfig {
	folder: MessageFolder;
	title: string;
	/** Translation keys for built-in folders; custom folders show `title` as typed by the user. */
	titleKey?: TranslationKey;
	emptyText: string;
	emptyTextKey?: TranslationKey;
	hrefPrefix: string;
	folderId?: string;
	icon: LucideIcon;
	headerIcons?: LucideIcon[];
	badgeVariant?: "default" | "secondary" | "outline";
	showRowBadge?: boolean;
}

export interface MessageListRowProps {
	message: Message;
	config: MessageFolderConfig;
	selected: boolean;
	active?: boolean;
	compact?: boolean;
	currentAccountName?: string;
	onSelectedChange: (messageId: string, selected: boolean) => void;
	onMessageAction: (
		messageId: string,
		action: RowMessageAction
	) => Promise<void>;
	// While anything is selected on a phone, tapping a row toggles it instead of opening it.
	selectionMode?: boolean;
	dragMessageIds: string[];
}

export type RowMessageAction =
	| "archive"
	| "trash"
	| "read"
	| "unread"
	| "inbox";

export interface MessageListRowActionsProps {
	message: Message;
	onAction: (action: RowMessageAction) => Promise<void>;
}

export interface MessageFolderPageProps {
	config: MessageFolderConfig;
	compact?: boolean;
	selectedMessageId?: string;
	selection?: MessageSelectionControl;
}

export interface MessageSplitLayoutProps {
	children: ReactNode;
	config: MessageFolderConfig;
}

export interface MessageListVisibility {
	visible: boolean;
	toggle: () => void;
	singleColumn: boolean;
	backHref: string;
	backLabel: string;
}

export interface BulkMessageToolbarProps {
	selectedCount: number;
	hasUnreadSelection: boolean;
	hideSelectedCount?: boolean;
	onAction: (action: BulkMessageAction, folderId?: string) => void;
	onClearSelection: () => void;
	pending: boolean;
	/** Folder being listed; archived, spam and trash offer a way back instead of the same move. */
	folder?: MessageFolder;
}

export type SelectedMessage = Pick<Message, "id" | "read">;

export interface MessageSelectionControl {
	selectedMessages: SelectedMessage[];
	setSelectedMessages: Dispatch<SetStateAction<SelectedMessage[]>>;
}

export interface BulkMessageSelectionPaneProps {
	folder?: MessageFolder;
	selectedMessages: SelectedMessage[];
	onClearSelection: () => void;
}

export interface PageRange {
	start: number;
	end: number;
	total: number;
}

export interface EmailPageTitleInput {
	location: string;
	total: number;
	unread: number;
	emailAddress: string | null;
	/** Set for the Inbox, which shows only the unread count. */
	inbox?: boolean;
}
