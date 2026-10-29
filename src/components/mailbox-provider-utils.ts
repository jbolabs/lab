import { authFetch, getClientSessionToken } from "@/lib/auth/client";

import type { MailboxOption } from "./mailbox-provider";

let mailboxesCache: MailboxOption[] | null = null;
let mailboxesCacheSessionToken: string | null = null;
let mailboxesRequest: Promise<MailboxOption[]> | null = null;
let mailboxesRequestSessionToken: string | null = null;
let cacheGeneration = 0;
export const SELECTED_MAILBOX_STORAGE_KEY = "selected-mailbox-id";

/**
 * The primary mailbox is the one at the account address; it is the only mailbox
 * whose name and avatar follow the profile.
 */
export function isIdentityMailbox(
	mailbox: Pick<MailboxOption, "type" | "isPrimary">
): boolean {
	return mailbox.type === "personal" && !!mailbox.isPrimary;
}

export function clearMailboxesCache() {
	cacheGeneration += 1;
	mailboxesCache = null;
	mailboxesCacheSessionToken = null;
	mailboxesRequest = null;
	mailboxesRequestSessionToken = null;
}

export function clearMailboxClientState() {
	clearMailboxesCache();
	if (typeof window !== "undefined") {
		localStorage.removeItem(SELECTED_MAILBOX_STORAGE_KEY);
	}
}

export function fetchMailboxOptions(force = false): Promise<MailboxOption[]> {
	const sessionToken = getClientSessionToken();
	if (!force && mailboxesCache && mailboxesCacheSessionToken === sessionToken) {
		return Promise.resolve(mailboxesCache);
	}
	if (
		!force &&
		mailboxesRequest &&
		mailboxesRequestSessionToken === sessionToken
	) {
		return mailboxesRequest;
	}

	const requestGeneration = cacheGeneration;
	mailboxesRequestSessionToken = sessionToken;
	mailboxesRequest = authFetch("/api/mailboxes")
		.then((res) => res.json())
		.then((data) => {
			const items = (
				(data as { mailboxes?: MailboxOption[] }).mailboxes ?? []
			).map((m) => ({
				autoReplyBody: m.autoReplyBody,
				autoReplyEnabled: m.autoReplyEnabled,
				autoReplySubject: m.autoReplySubject,
				displayName: m.displayName,
				domainId: m.domainId,
				hasAvatar: m.hasAvatar,
				hostname: m.hostname,
				id: m.id,
				isPrimary: m.isPrimary,
				localPart: m.localPart,
				permission: m.permission,
				senderAddresses: m.senderAddresses,
				signature: m.signature,
				type: m.type,
			}));
			if (requestGeneration === cacheGeneration) {
				mailboxesCache = items;
				mailboxesCacheSessionToken = sessionToken;
			}
			return items;
		})
		.finally(() => {
			if (requestGeneration === cacheGeneration) {
				mailboxesRequest = null;
				mailboxesRequestSessionToken = null;
			}
		});

	return mailboxesRequest;
}
