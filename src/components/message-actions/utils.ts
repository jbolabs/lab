import {
	ArchiveIcon,
	InboxIcon,
	ShieldAlertIcon,
	Trash2Icon,
} from "lucide-react";

import { sanitizeEmailHtml } from "@/app/(dashboard)/inbox/[messageId]/email-html-sanitizer";
import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import {
	escapeHtml,
	htmlToPlainText,
	textToHtml,
	wrapQuotedHtml,
} from "@/components/compose/rich-text-utils";
import { markMessagesReadInCaches } from "@/hooks/utils";
import { authFetch } from "@/lib/auth/client";
import {
	getEmailAddress,
	normalizeEmailAddress,
	splitEmailAddressList,
} from "@/lib/email/address";
import { getLatestEmailContent } from "@/lib/email/reply-content-utils";
import { throwIfDeleteSkipped } from "@/lib/messages/permanent-delete-utils";
import { formatUserDate } from "@/lib/time/utils";

import type {
	BlockMessageContactInput,
	ForwardDraftInput,
	MoveMessageActionItem,
	ReplyableMessage,
	ReplyDraftInput,
	ReplyMode,
	ReplyRecipients,
	TrashSenderRuleInput,
} from "./types";

export function getMessageBackHref(
	direction: "inbound" | "outbound",
	status: string
) {
	if (status === "trash") {
		return "/trash";
	}
	if (status === "spam") {
		return "/spam";
	}
	if (status === "archived") {
		return "/archived";
	}
	if (status === "draft") {
		return "/drafts";
	}
	return direction === "inbound" ? "/inbox" : "/sent";
}

export async function runSingleMessageAction(
	messageId: string,
	action: BulkMessageAction
) {
	const response = await authFetch("/api/messages/bulk", {
		body: JSON.stringify({ action, messageIds: [messageId] }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

	if (!response.ok) {
		throw new Error("Unable to update message");
	}

	await throwIfDeleteSkipped(response, action);
	if (action === "read" || action === "unread") {
		markMessagesReadInCaches([messageId], action === "read");
	}
	window.dispatchEvent(new Event("mailflare:messages-changed"));
}

export function openUnsubscribeUrl(url: string) {
	window.open(url, "_blank", "noopener,noreferrer");
}

export const trashWithoutUnsubscribeText =
	"This email does not provide an unsubscribe link. It will be moved to Trash, and future emails from this sender will also be moved to Trash.";

export async function createTrashSenderRule({
	mailboxId,
	senderAddress,
}: TrashSenderRuleInput) {
	const sender = getEmailAddress(senderAddress).trim().toLowerCase();
	if (!sender) {
		throw new Error("Sender address is required");
	}

	const response = await authFetch("/api/routing-rules", {
		body: JSON.stringify({
			destination: "trash",
			mailboxId,
			matchField: "email",
			matchOperator: "exact",
			matchValue: sender,
			priority: 0,
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const data = (await response.json()) as { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? "Unable to create trash rule");
	}
}

export async function blockMessageContact({
	mailboxId,
	senderAddress,
}: BlockMessageContactInput) {
	const response = await authFetch("/api/contacts/block", {
		body: JSON.stringify({ address: senderAddress, mailboxId }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const data = (await response.json()) as { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? "Unable to block contact");
	}
}

export function getMoveMessageActions(
	status: string,
	direction: "inbound" | "outbound"
): MoveMessageActionItem[] {
	const actions: MoveMessageActionItem[] = [];
	if ((status === "archived" || status === "spam") && direction === "inbound") {
		actions.push({
			action: "inbox",
			icon: InboxIcon,
			labelKey: status === "spam" ? "common.notSpam" : "navigation.inbox",
		});
	}
	if (status !== "archived") {
		actions.push({
			action: "archive",
			icon: ArchiveIcon,
			labelKey: "navigation.archived",
		});
	}
	if (status !== "spam") {
		actions.push({
			action: "spam",
			icon: ShieldAlertIcon,
			labelKey: "navigation.spam",
		});
	}
	if (status !== "trash") {
		actions.push({
			action: "trash",
			icon: Trash2Icon,
			labelKey: "navigation.trash",
		});
	}
	return actions;
}

export function getMessageActionRedirect(
	action: BulkMessageAction,
	listHref: string
) {
	if (
		action === "trash" ||
		action === "spam" ||
		action === "archive" ||
		action === "inbox"
	) {
		return listHref;
	}
	return null;
}

export function buildReplySubject(subject: string | null | undefined) {
	const trimmed = (subject ?? "").trim();
	if (!trimmed) {
		return "Re:";
	}
	return /^re\s*(?<capture1>\[\d+\])?\s*:/iu.test(trimmed)
		? trimmed
		: `Re: ${trimmed}`;
}

export function buildReplyQuote(
	senderAddress: string,
	bodyText: string | null | undefined
) {
	const latest = getLatestEmailContent(bodyText).trim();
	if (!latest) {
		return "";
	}
	const quoted = latest
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");
	return `\n\n${getEmailAddress(senderAddress)} wrote:\n${quoted}\n`;
}

const QUOTE_STYLE =
	"margin:0 0 0 0;border-left:1px solid #ccc;padding-left:1ex;opacity:0.6";

/**
 * The folded quote under a reply: the "On <date>, <sender> wrote:" line every
 * client recognises, then the original as HTML (sanitised) or as text.
 */
export function buildReplyQuoteHtml(
	senderAddress: string,
	sentAt: string | null | undefined,
	bodyText: string | null | undefined,
	bodyHtml: string | null | undefined
) {
	const original = bodyHtml
		? sanitizeEmailHtml(bodyHtml, { forOutgoing: true })
		: textToHtml(bodyText);
	if (!original) {
		return null;
	}
	const when = sentAt
		? formatUserDate(sentAt, {
				day: "numeric",
				hour: "numeric",
				minute: "2-digit",
				month: "short",
				weekday: "short",
				year: "numeric",
			})
		: "an earlier date";
	return wrapQuotedHtml(
		`<div style="margin-top:1.4em">On ${escapeHtml(when)}, ${escapeHtml(senderAddress)} wrote:</div><blockquote style="${QUOTE_STYLE}">${original}</blockquote>`
	);
}

/**
 * Who a reply goes to. A plain reply answers the sender, or the Reply-To
 * addresses when the message names any (RFC 5322 §3.6.2); reply-all also keeps
 * everyone else on the To and Cc lines, minus the mailbox's own addresses.
 * The original sender stays even when the message came from another own alias.
 * Replying to a sent message re-addresses its original recipients.
 */
export function getReplyRecipients(
	message: ReplyableMessage,
	ownAddresses: string[],
	mode: ReplyMode
): ReplyRecipients {
	const own = new Set(
		ownAddresses.map((address) => normalizeEmailAddress(address))
	);
	const seen = new Set<string>();
	const unique = (entries: string[], excludeOwn = true) =>
		entries.filter((entry) => {
			const key = normalizeEmailAddress(entry);
			if (!key || (excludeOwn && own.has(key)) || seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});

	if (message.direction === "outbound") {
		const to = unique(splitEmailAddressList(message.toAddr));
		const cc =
			mode === "replyAll" ? unique(splitEmailAddressList(message.ccAddr)) : [];
		return { cc, to };
	}

	const replyTo = unique(splitEmailAddressList(message.replyTo));
	const to = replyTo.length ? replyTo : unique([message.fromAddr], false);
	if (mode !== "replyAll") {
		return { cc: [], to };
	}
	const cc = unique([
		...splitEmailAddressList(message.toAddr),
		...splitEmailAddressList(message.ccAddr),
	]);
	return { cc, to };
}

/** Reply-all is only worth offering when it would reach someone a plain reply would not. */
export function hasAdditionalRecipients(
	message: ReplyableMessage,
	ownAddresses: string[]
): boolean {
	const all = getReplyRecipients(message, ownAddresses, "replyAll");
	const single = getReplyRecipients(message, ownAddresses, "reply");
	return all.to.length + all.cc.length > single.to.length + single.cc.length;
}

/** The threading headers a reply must carry so both sides file it in the same conversation. */
export function getReplyThreading(message: ReplyableMessage) {
	const parentId =
		(message.providerMessageId ?? "").trim().replaceAll(/^<|>$/gu, "") || null;
	const chain = (message.references ?? "")
		.split(/\s+/u)
		.map((id) => id.replaceAll(/^<|>$/gu, ""))
		.filter(Boolean);
	if (parentId && !chain.includes(parentId)) {
		chain.push(parentId);
	}
	return {
		inReplyTo: parentId,
		references: chain.length ? chain.join(" ") : null,
		threadId: message.threadId ?? parentId,
	};
}

export function buildForwardSubject(subject: string | null | undefined) {
	const trimmed = (subject ?? "").trim();
	if (!trimmed) {
		return "Fwd:";
	}
	return /^fwd?:/iu.test(trimmed) ? trimmed : `Fwd: ${trimmed}`;
}

/** The header block mail clients put above a forwarded message, as folded HTML. */
export function buildForwardHtml(
	message: ForwardDraftInput["message"],
	bodyText: string | null | undefined,
	bodyHtml: string | null | undefined
) {
	const lines = [
		`From: ${message.fromAddr}`,
		`Date: ${formatUserDate(message.createdAt, { day: "numeric", hour: "numeric", minute: "2-digit", month: "short", weekday: "short", year: "numeric" })}`,
		`Subject: ${message.subject ?? "(no subject)"}`,
		`To: ${message.toAddr}`,
	];
	if (message.ccAddr) {
		lines.push(`Cc: ${message.ccAddr}`);
	}
	const header = `<div>---------- Forwarded message ---------<br>${lines.map(escapeHtml).join("<br>")}</div><br>`;
	const original = bodyHtml
		? sanitizeEmailHtml(bodyHtml, { forOutgoing: true })
		: textToHtml(bodyText);
	return wrapQuotedHtml(`${header}${original ?? ""}`);
}

/**
 * A forward keeps the original's attachments (copied onto the draft server-side)
 * and references its Message-ID so recipients who already have it see the link.
 */
export async function createForwardDraft({
	mailboxId,
	ownAddress,
	message,
	bodyText,
	bodyHtml,
}: ForwardDraftInput) {
	const html = buildForwardHtml(message, bodyText, bodyHtml);
	const response = await authFetch("/api/drafts", {
		body: JSON.stringify({
			forwardOfMessageId: message.id,
			from: getEmailAddress(ownAddress ?? ""),
			html,
			mailboxId,
			references: getReplyThreading(message).references,
			subject: buildForwardSubject(message.subject),
			text: htmlToPlainText(html),
			threadId: message.threadId,
			to: "",
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const data = (await response.json()) as {
		draft?: { id: string };
		error?: string;
	};
	if (!response.ok || !data.draft) {
		throw new Error(data.error ?? "Unable to start forward");
	}
	return data.draft.id;
}

export async function createReplyDraft({
	mailboxId,
	senderAddress,
	ownAddress,
	subject,
	bodyText,
	bodyHtml,
	sentAt,
	recipients,
	threading,
}: ReplyDraftInput) {
	if (recipients.to.length === 0) {
		throw new Error("Sender address is required");
	}
	const html =
		buildReplyQuoteHtml(senderAddress, sentAt, bodyText, bodyHtml) ?? "";

	const response = await authFetch("/api/drafts", {
		body: JSON.stringify({
			cc: recipients.cc.join(", "),
			from: getEmailAddress(ownAddress ?? ""),
			html,
			mailboxId,
			subject: buildReplySubject(subject),
			text: htmlToPlainText(html),
			to: recipients.to.join(", "),
			...threading,
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const data = (await response.json()) as {
		draft?: { id: string };
		error?: string;
	};
	if (!response.ok || !data.draft) {
		throw new Error(data.error ?? "Unable to create reply draft");
	}
	return data.draft.id;
}
