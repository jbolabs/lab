import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { withCleanup } from "@/lib/async-cleanup";

import type { Message, MessageFilterOptions, MessageFolder } from "./types";
import {
	clearMessageCountsCache,
	clearMessageListCache,
	fetchMessageList,
	getMessageQueryParams,
} from "./utils";

const REFRESH_DEBOUNCE_MS = 150;

export function useMessages(
	folder: MessageFolder,
	mailboxId?: string | null,
	filters?: MessageFilterOptions,
	enabled = true,
	folderId?: string | null
) {
	const stableFilters = useMemo(
		() => ({
			group: filters?.group,
			limit: filters?.limit,
			offset: filters?.offset,
			query: filters?.query,
			read: filters?.read,
			title: filters?.title,
		}),
		[
			filters?.group,
			filters?.limit,
			filters?.offset,
			filters?.query,
			filters?.read,
			filters?.title,
		]
	);
	const [messages, setMessages] = useState<Message[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [total, setTotal] = useState(0);
	const [limit, setLimit] = useState(filters?.limit ?? 25);
	const [offset, setOffset] = useState(filters?.offset ?? 0);
	const reload = useRef<() => Promise<void>>(async () => {
		// The effect installs the real loader before refresh events can fire.
	});

	const unreadCount = messages.filter(
		(m) => m.direction === "inbound" && !m.read
	).length;

	useEffect(() => {
		if (!enabled) {
			return;
		}
		let cancelled = false;
		let refreshTimer: number | null = null;
		let requestNumber = 0;
		async function loadMessages(force = false, showLoading = false) {
			requestNumber += 1;
			const currentRequest = requestNumber;
			if (showLoading) {
				setIsLoading(true);
			}
			return await withCleanup(
				async () => {
					const params = getMessageQueryParams(
						folder,
						mailboxId,
						stableFilters,
						folderId
					);
					const data = await fetchMessageList(params, force);
					if (!cancelled && currentRequest === requestNumber) {
						setMessages(data.messages ?? []);
						setTotal(data.total ?? 0);
						setLimit(data.limit ?? stableFilters.limit ?? 25);
						setOffset(data.offset ?? stableFilters.offset ?? 0);
					}
				},
				() => {
					if (!cancelled && currentRequest === requestNumber) {
						setIsLoading(false);
					}
				}
			);
		}

		void loadMessages(false, true);
		reload.current = () => loadMessages(true);
		function onMessagesChanged() {
			clearMessageListCache();
			clearMessageCountsCache();
			if (document.visibilityState !== "visible") {
				return;
			}
			if (refreshTimer) {
				window.clearTimeout(refreshTimer);
			}
			refreshTimer = window.setTimeout(() => {
				refreshTimer = null;
				void loadMessages(true);
			}, REFRESH_DEBOUNCE_MS);
		}
		window.addEventListener("mailflare:messages-changed", onMessagesChanged);

		return () => {
			cancelled = true;
			window.removeEventListener(
				"mailflare:messages-changed",
				onMessagesChanged
			);
			if (refreshTimer) {
				window.clearTimeout(refreshTimer);
			}
		};
	}, [enabled, stableFilters, folder, folderId, mailboxId]);

	// Pull-to-refresh: refetch now and resolve when the list is back; counts follow the usual event.
	const refresh = useCallback(() => {
		clearMessageListCache();
		clearMessageCountsCache();
		window.dispatchEvent(new Event("mailflare:message-counts-changed"));
		return reload.current();
	}, []);

	return {
		isLoading,
		limit,
		messages,
		offset,
		refresh,
		total,
		unreadCount,
		updateMessages: setMessages,
	};
}
