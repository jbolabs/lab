import type { PermanentDeleteFolder } from "@/app/api/messages/bulk/types";
import type { EmptyFolderResponse } from "@/app/api/messages/empty/types";
import type { MailboxOption } from "@/components/mailbox-provider";
import type { Message } from "@/hooks/types";
import { markMessagesReadInCaches } from "@/hooks/utils";
import { authFetch } from "@/lib/auth/client";
import {
	getEmailDisplayName,
	splitEmailAddressList,
} from "@/lib/email/address";
import { defaultTranslator } from "@/lib/i18n/utils";
import type { Translator } from "@/lib/i18n/utils";
import { throwIfDeleteSkipped } from "@/lib/messages/permanent-delete-utils";
import {
	formatUserDate,
	getUserTimeZone,
	zonedDateFields,
} from "@/lib/time/utils";

import type {
	EmailPageTitleInput,
	MessageFolderConfig,
	PageRange,
} from "./types";

/** "Maya Chen, +2" for a multi-recipient message, or just the one name. */
export function formatRecipientSummary(
	toAddr: string,
	firstContactName?: string | null,
	t: Translator = defaultTranslator
): string {
	const entries = splitEmailAddressList(toAddr);
	if (entries.length === 0) {
		return t("list.noRecipient");
	}
	const first = firstContactName ?? getEmailDisplayName(entries[0]);
	return entries.length > 1 ? `${first}, +${entries.length - 1}` : first;
}

export function getMessageParty(
	message: Message,
	folder: MessageFolderConfig["folder"],
	currentAccountName?: string,
	t: Translator = defaultTranslator
) {
	if (folder === "drafts") {
		return t("list.draft");
	}
	if (folder === "sent" || folder === "scheduled") {
		return formatRecipientSummary(message.toAddr, message.toContactName, t);
	}
	if (message.direction === "outbound" && currentAccountName) {
		return currentAccountName;
	}
	return (
		message.fromContactName ??
		(message.fromAddr
			? getEmailDisplayName(message.fromAddr)
			: t("list.unknownSender"))
	);
}

/** A grouped row is read only after every message represented by it is read. */
export function isMessageListRowUnread(message: Message): boolean {
	if (message.threadMessageIds) {
		return (message.threadUnread ?? 0) > 0;
	}
	return message.direction === "inbound" && !message.read;
}

export function getMessagePartyClassName(
	message: Message,
	folder: MessageFolderConfig["folder"]
) {
	if (folder === "drafts") {
		return "truncate font-medium text-destructive";
	}

	const unread = isMessageListRowUnread(message);
	return `truncate ${unread ? "font-bold text-foreground" : "text-foreground"}`;
}

/** How many unread messages a read or unread action on this row would flip. */
export function getUnreadFlipCount(
	message: Message,
	readValue: boolean
): number {
	if (message.threadMessageIds) {
		const unread = Math.min(
			message.threadUnread ?? 0,
			message.threadMessageIds.length
		);
		return readValue ? unread : message.threadMessageIds.length - unread;
	}
	if (message.direction !== "inbound") {
		return 0;
	}
	return message.read === readValue ? 0 : 1;
}

export function getMessagePreview(
	message: Message,
	folder: MessageFolderConfig["folder"],
	t: Translator = defaultTranslator
) {
	if (folder === "drafts") {
		return message.snippet || message.toAddr || t("list.noContent");
	}
	return message.snippet || t("thread.noPreview");
}

export function formatMessageListTimestamp(createdAt: string): string {
	const zone = getUserTimeZone();
	const date = zonedDateFields(new Date(createdAt), zone);
	const today = zonedDateFields(new Date(), zone);
	if (date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)) {
		return formatUserDate(createdAt, { hour: "2-digit", minute: "2-digit" });
	}
	if (date.getUTCFullYear() === today.getUTCFullYear()) {
		return formatUserDate(createdAt, { day: "2-digit", month: "short" });
	}
	return formatUserDate(createdAt, {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export function getPageRange(
	offset: number,
	count: number,
	total: number
): PageRange {
	if (total === 0 || count === 0) {
		return { end: 0, start: 0, total };
	}

	return {
		end: Math.min(offset + count, total),
		start: offset + 1,
		total,
	};
}

export function getMailboxAddress(
	mailbox: Pick<MailboxOption, "localPart" | "hostname"> | null | undefined
): string | null {
	if (!mailbox) {
		return null;
	}
	return `${mailbox.localPart}@${mailbox.hostname}`;
}

export function getEmailPageTitleCount(total: number, unread: number): number {
	return unread > 0 ? unread : total;
}

export function formatEmailPageTitle({
	location,
	total,
	unread,
	emailAddress,
	inbox = location === "Inbox",
}: EmailPageTitleInput): string {
	if (inbox) {
		return unread > 0 ? `${location} (${unread})` : location;
	}
	const count = getEmailPageTitleCount(total, unread);
	const suffix = emailAddress ? ` - ${emailAddress}` : "";
	return `${location} (${count})${suffix}`;
}

export async function runBulkMessageAction(
	messageIds: string[],
	action: string,
	notify = true,
	folderId?: string
) {
	const response = await authFetch("/api/messages/bulk", {
		body: JSON.stringify({ action, folderId, messageIds }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

	if (!response.ok) {
		throw new Error(defaultTranslator("error.updateSelected"));
	}
	await throwIfDeleteSkipped(response, action);
	if (action === "read" || action === "unread") {
		markMessagesReadInCaches(messageIds, action === "read");
	}
	if (notify) {
		window.dispatchEvent(new Event("mailflare:messages-changed"));
	}
}

/**
 * Empty a mailbox's Trash or Spam. The API deletes in batches and reports what is
 * left, so keep calling until nothing remains (or a call stops making progress).
 */
export async function emptyMessageFolder(
	mailboxId: string,
	folder: PermanentDeleteFolder
): Promise<number> {
	async function deleteBatch(deletedTotal: number): Promise<number> {
		const response = await authFetch("/api/messages/empty", {
			body: JSON.stringify({ folder, mailboxId }),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		const data = (await response
			.json()
			.catch(() => ({}))) as EmptyFolderResponse;
		if (!response.ok) {
			throw new Error(data.error ?? defaultTranslator("error.emptyFolder"));
		}
		const nextTotal = deletedTotal + (data.deleted ?? 0);
		return data.remaining && data.deleted ? deleteBatch(nextTotal) : nextTotal;
	}
	const deletedTotal = await deleteBatch(0);
	window.dispatchEvent(new Event("mailflare:messages-changed"));
	return deletedTotal;
}
