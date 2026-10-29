import type { MailboxOption } from "./mailbox-provider";

export interface MailboxSelectorUser {
	id: string;
	email: string;
	name: string;
	role: "admin" | "user";
	hasAvatar: boolean;
}

export interface MailboxSelectorProps {
	initialUser?: MailboxSelectorUser;
}

export interface AccountAvatarProps {
	name: string;
	colorSeed?: string;
	hasAvatar?: boolean;
	avatarUrl?: string;
	size?: "small" | "large";
	onAvatarError?: () => void;
}

export interface MailboxAccountRowProps {
	mailbox: MailboxOption;
	unread: number;
	avatarUrl?: string;
	onSelect: () => void;
}
