import { useCallback, useEffect, useRef, useState } from "react";
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
	folderId?: string | null,
) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [total, setTotal] = useState(0);
	const [limit, setLimit] = useState(filters?.limit ?? 25);
	const [offset, setOffset] = useState(filters?.offset ?? 0);
	const reload = useRef<() => Promise<void>>(async () => {});

	const unreadCount = messages.filter((m) => m.direction === "inbound" && !m.read).length;

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		let refreshTimer: number | null = null;
		let requestNumber = 0;
		async function loadMessages(force = false, showLoading = false) {
			const currentRequest = ++requestNumber;
			if (showLoading) setIsLoading(true);
			try {
				const params = getMessageQueryParams(folder, mailboxId, filters, folderId);
				const data = await fetchMessageList(params, force);
				if (!cancelled && currentRequest === requestNumber) {
					setMessages(data.messages ?? []);
					setTotal(data.total ?? 0);
					setLimit(data.limit ?? filters?.limit ?? 25);
					setOffset(data.offset ?? filters?.offset ?? 0);
				}
			} finally {
				if (!cancelled && currentRequest === requestNumber) setIsLoading(false);
			}
		}

		void loadMessages(false, true);
		reload.current = () => loadMessages(true);
		function onMessagesChanged() {
			clearMessageListCache();
			clearMessageCountsCache();
			if (document.visibilityState !== "visible") return;
			if (refreshTimer) window.clearTimeout(refreshTimer);
			refreshTimer = window.setTimeout(() => {
				refreshTimer = null;
				void loadMessages(true);
			}, REFRESH_DEBOUNCE_MS);
		}
		window.addEventListener("mailflare:messages-changed", onMessagesChanged);

		return () => {
			cancelled = true;
			window.removeEventListener("mailflare:messages-changed", onMessagesChanged);
			if (refreshTimer) window.clearTimeout(refreshTimer);
		};
	}, [enabled, filters?.group, filters?.limit, filters?.offset, filters?.query, filters?.read, filters?.title, folder, folderId, mailboxId]);

	// Pull-to-refresh: refetch now and resolve when the list is back; counts follow the usual event.
	const refresh = useCallback(() => {
		clearMessageListCache();
		clearMessageCountsCache();
		window.dispatchEvent(new Event("mailflare:message-counts-changed"));
		return reload.current();
	}, []);

	return { messages, unreadCount, isLoading, total, limit, offset, updateMessages: setMessages, refresh };
}
