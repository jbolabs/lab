import {
	Archive,
	Clock,
	CalendarClock,
	Inbox,
	Send,
	ShieldAlert,
	Star,
	Trash2,
} from "lucide-react";

import type { MessageFolderConfig } from "./types";

export const inboxFolderConfig: MessageFolderConfig = {
	emptyText: "No emails",
	emptyTextKey: "folder.empty.inbox",
	folder: "inbox",
	hrefPrefix: "/inbox",
	icon: Inbox,
	showRowBadge: false,
	title: "Inbox",
	titleKey: "navigation.inbox",
};

export const starredFolderConfig: MessageFolderConfig = {
	badgeVariant: "outline",
	emptyText: "No starred emails",
	emptyTextKey: "folder.empty.starred",
	folder: "starred",
	hrefPrefix: "/starred",
	icon: Star,
	title: "Starred",
	titleKey: "navigation.starred",
};

export const snoozedFolderConfig: MessageFolderConfig = {
	badgeVariant: "outline",
	emptyText: "No snoozed emails",
	emptyTextKey: "folder.empty.snoozed",
	folder: "snoozed",
	hrefPrefix: "/snoozed",
	icon: Clock,
	title: "Snoozed",
	titleKey: "navigation.snoozed",
};

export const sentFolderConfig: MessageFolderConfig = {
	badgeVariant: "outline",
	emptyText: "No emails",
	emptyTextKey: "folder.empty.inbox",
	folder: "sent",
	hrefPrefix: "/sent",
	icon: Send,
	title: "Sent",
	titleKey: "navigation.sent",
};

export const scheduledFolderConfig: MessageFolderConfig = {
	badgeVariant: "outline",
	emptyText: "No scheduled emails",
	emptyTextKey: "folder.empty.scheduled",
	folder: "scheduled",
	hrefPrefix: "/scheduled",
	icon: CalendarClock,
	title: "Scheduled",
	titleKey: "navigation.scheduled",
};

export const archivedFolderConfig: MessageFolderConfig = {
	badgeVariant: "outline",
	emptyText: "No archived emails",
	emptyTextKey: "folder.empty.archived",
	folder: "archived",
	hrefPrefix: "/archived",
	icon: Archive,
	title: "Archived",
	titleKey: "navigation.archived",
};

export const spamFolderConfig: MessageFolderConfig = {
	badgeVariant: "outline",
	emptyText: "No spam",
	emptyTextKey: "folder.empty.spam",
	folder: "spam",
	hrefPrefix: "/spam",
	icon: ShieldAlert,
	title: "Spam",
	titleKey: "navigation.spam",
};

export const trashFolderConfig: MessageFolderConfig = {
	badgeVariant: "outline",
	emptyText: "No emails in trash",
	emptyTextKey: "folder.empty.trash",
	folder: "trash",
	hrefPrefix: "/trash",
	icon: Trash2,
	title: "Trash",
	titleKey: "navigation.trash",
};
