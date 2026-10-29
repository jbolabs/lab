"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { ReactNode } from "react";

import {
	AUTH_SESSION_CHANGED_EVENT,
	getClientSessionToken,
} from "@/lib/auth/client";
import { PROFILE_AVATAR_CHANGED_EVENT } from "@/lib/profile/avatar-client";
import { PROFILE_NAME_CHANGED_EVENT } from "@/lib/profile/name-client";
import type { ProfileNameChangedDetail } from "@/lib/profile/types";

import {
	clearMailboxesCache,
	fetchMailboxOptions,
	isIdentityMailbox,
	SELECTED_MAILBOX_STORAGE_KEY,
} from "./mailbox-provider-utils";

export interface MailboxOption {
	id: string;
	domainId: string;
	localPart: string;
	hostname: string;
	displayName: string | null;
	signature?: string | null;
	autoReplyEnabled?: boolean;
	autoReplySubject?: string;
	autoReplyBody?: string;
	hasAvatar?: boolean;
	type?: "personal" | "shared";
	permission?: "read_only" | "send_as" | "send_on_behalf" | "full_access";
	isPrimary?: boolean;
	senderAddresses?: string[];
}

interface MailboxContextValue {
	selectedMailbox: MailboxOption | null;
	setSelectedMailbox: (mb: MailboxOption | null) => void;
	mailboxes: MailboxOption[];
	isLoading: boolean;
}

const MailboxContext = createContext<MailboxContextValue | null>(null);

export function useSelectedMailbox() {
	const ctx = useContext(MailboxContext);
	if (!ctx) {
		throw new Error("useSelectedMailbox must be used within MailboxProvider");
	}
	return ctx;
}

export function MailboxProvider({ children }: { children: ReactNode }) {
	const [mailboxes, setMailboxes] = useState<MailboxOption[]>([]);
	const [selectedMailboxValue, setSelectedMailboxValue] =
		useState<MailboxOption | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		const sessionToken = getClientSessionToken();

		void fetchMailboxOptions()
			.then((items) => {
				if (cancelled || sessionToken !== getClientSessionToken()) {
					return null;
				}
				setMailboxes(items);

				const storedId = localStorage.getItem(SELECTED_MAILBOX_STORAGE_KEY);
				if (storedId) {
					const found = items.find((mb) => mb.id === storedId);
					if (found) {
						setSelectedMailboxValue(found);
						return null;
					}
				}

				const primary = items.find((mb) => mb.isPrimary) ?? items[0] ?? null;
				if (primary) {
					setSelectedMailboxValue(primary);
					localStorage.setItem(SELECTED_MAILBOX_STORAGE_KEY, primary.id);
				}

				return null;
			})
			.catch(() => {
				// No provider or recoverable background failure requires an action.
			})
			.finally(() => {
				if (!cancelled && sessionToken === getClientSessionToken()) {
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		function resetMailboxState() {
			setMailboxes([]);
			setSelectedMailboxValue(null);
			setIsLoading(true);
		}

		window.addEventListener(AUTH_SESSION_CHANGED_EVENT, resetMailboxState);
		return () =>
			window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, resetMailboxState);
	}, []);

	useEffect(() => {
		function updatePersonalMailboxNames(event: Event) {
			const { name } = (event as CustomEvent<ProfileNameChangedDetail>).detail;
			clearMailboxesCache();
			// Only the primary mailbox follows the profile name; the rest keep their own.
			setMailboxes((items) =>
				items.map((mailbox) =>
					isIdentityMailbox(mailbox)
						? { ...mailbox, displayName: name }
						: mailbox
				)
			);
			setSelectedMailboxValue((mailbox) =>
				mailbox && isIdentityMailbox(mailbox)
					? { ...mailbox, displayName: name }
					: mailbox
			);
		}

		window.addEventListener(
			PROFILE_NAME_CHANGED_EVENT,
			updatePersonalMailboxNames
		);
		return () =>
			window.removeEventListener(
				PROFILE_NAME_CHANGED_EVENT,
				updatePersonalMailboxNames
			);
	}, []);

	useEffect(() => {
		function updatePersonalMailboxAvatars() {
			clearMailboxesCache();
			setMailboxes((items) =>
				items.map((mailbox) =>
					isIdentityMailbox(mailbox) ? { ...mailbox, hasAvatar: true } : mailbox
				)
			);
			setSelectedMailboxValue((mailbox) =>
				mailbox && isIdentityMailbox(mailbox)
					? { ...mailbox, hasAvatar: true }
					: mailbox
			);
		}

		window.addEventListener(
			PROFILE_AVATAR_CHANGED_EVENT,
			updatePersonalMailboxAvatars
		);
		return () =>
			window.removeEventListener(
				PROFILE_AVATAR_CHANGED_EVENT,
				updatePersonalMailboxAvatars
			);
	}, []);

	const setSelectedMailbox = useCallback((mb: MailboxOption | null) => {
		setSelectedMailboxValue((current) =>
			current?.id === mb?.id ? current : mb
		);
		if (mb) {
			setMailboxes((items) =>
				items.map((item) => (item.id === mb.id && item !== mb ? mb : item))
			);
			localStorage.setItem(SELECTED_MAILBOX_STORAGE_KEY, mb.id);
		} else {
			localStorage.removeItem(SELECTED_MAILBOX_STORAGE_KEY);
		}
	}, []);

	const value = useMemo(
		() => ({
			isLoading,
			mailboxes,
			selectedMailbox: selectedMailboxValue,
			setSelectedMailbox,
		}),
		[isLoading, mailboxes, selectedMailboxValue, setSelectedMailbox]
	);
	return (
		<MailboxContext.Provider value={value}>{children}</MailboxContext.Provider>
	);
}
