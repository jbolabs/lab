import type { ReactNode } from "react";

import type { MessageNavigationEntry } from "@/app/api/messages/navigation/types";

import type { MessageFolderConfig } from "./types";

export interface MessageDetailNavigationProviderProps {
	children: ReactNode;
	config: MessageFolderConfig;
}

export interface MessageDetailNavigationProps {
	messageId: string;
	unread: boolean;
}

export interface MessageDetailNavigationSnapshot {
	key: string;
	entries: MessageNavigationEntry[];
}

export interface OpenedUnreadMessages {
	key: string;
	ids: Set<string>;
}

export interface MessageDetailNavigationContextValue {
	entries: MessageNavigationEntry[];
	hrefPrefix: string;
	recordUnread: (messageId: string) => void;
}

export interface MessageDetailNavigationState {
	previousId: string | null;
	nextId: string | null;
	unreadOrder: number;
	totalUnread: number;
}
