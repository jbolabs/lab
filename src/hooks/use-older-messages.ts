import { useCallback, useEffect, useRef, useState } from "react";

import type { Message, MessageFilterOptions, MessageFolder } from "./types";
import { fetchMessageList, getMessageQueryParams } from "./utils";

/**
 * Endless scrolling for phone lists: `useMessages` keeps the live first page, and this loads the pages
 * after it on demand. Loaded pages are refetched whenever mail changes, so an archive or a new message
 * shifts them instead of leaving stale or duplicated rows. Changing the folder or filters drops them.
 */
export function useOlderMessages(
	folder: MessageFolder,
	mailboxId: string | null | undefined,
	filters: MessageFilterOptions & { limit: number },
	firstPage: Message[],
	total: number,
	enabled: boolean,
	folderId?: string | null
) {
	const generation = useRef(0);
	const key = JSON.stringify([
		folder,
		mailboxId,
		folderId,
		filters.query,
		filters.read,
		filters.group,
		filters.limit,
		enabled,
	]);
	const [state, setState] = useState<{
		key: string;
		pages: Message[][];
		loading: boolean;
	}>({ key, loading: false, pages: [] });
	if (state.key !== key) {
		setState({ key, loading: false, pages: [] });
	}
	const pages = state.key === key ? state.pages : [];
	const loading = state.key === key && state.loading;
	const setPages = useCallback(
		(update: Message[][] | ((pages: Message[][]) => Message[][])) => {
			setState((current) =>
				current.key === key
					? {
							...current,
							pages:
								typeof update === "function" ? update(current.pages) : update,
						}
					: current
			);
		},
		[key]
	);
	const setLoading = useCallback(
		(value: boolean) => {
			setState((current) =>
				current.key === key ? { ...current, loading: value } : current
			);
		},
		[key]
	);
	const query = getMessageQueryParams(
		folder,
		mailboxId,
		filters,
		folderId
	).toString();
	const fetchPage = useCallback(
		async (offset: number) => {
			const params = new URLSearchParams(query);
			params.set("offset", String(offset));
			const data = await fetchMessageList(params, true);
			return data.messages ?? [];
		},
		[query]
	);

	const pageCount = pages.length;
	useEffect(() => {
		// Listen even before the first older page lands, so a change during that load invalidates it.
		if (!enabled) {
			return;
		}
		function onMessagesChanged() {
			// A refresh supersedes earlier refreshes and any page still loading, so a slow, older
			// response can never put back rows that a newer one removed.
			generation.current += 1;
			const started = generation.current;
			setLoading(false);
			const offsets = Array.from(
				{ length: pageCount },
				(_, index) => (index + 1) * filters.limit
			);
			void Promise.all(offsets.map(fetchPage))
				.then((refreshed) => {
					if (started === generation.current) {
						setPages(refreshed.filter((page) => page.length > 0));
					}

					return null;
				})
				.catch(() => {
					// Keep the current UI state when this optional background request fails.
				});
		}
		window.addEventListener("mailflare:messages-changed", onMessagesChanged);
		return () =>
			window.removeEventListener(
				"mailflare:messages-changed",
				onMessagesChanged
			);
	}, [enabled, pageCount, fetchPage, filters.limit, setLoading, setPages]);

	const loaded =
		firstPage.length + pages.reduce((count, page) => count + page.length, 0);
	const hasMore = enabled && firstPage.length > 0 && loaded < total;

	const loadMore = useCallback(() => {
		if (!hasMore || loading) {
			return;
		}
		const started = generation.current;
		setLoading(true);
		void fetchPage((pageCount + 1) * filters.limit)
			.then((page) => {
				if (started === generation.current && page.length > 0) {
					setPages((current) => [...current, page]);
				}

				return null;
			})
			.catch(() => {
				// Keep the current UI state when this optional background request fails.
			})
			.finally(() => {
				if (started === generation.current) {
					setLoading(false);
				}
			});
	}, [
		hasMore,
		loading,
		pageCount,
		fetchPage,
		filters.limit,
		setLoading,
		setPages,
	]);

	// A message can sit on two pages for a moment while they shift; show it once.
	const seen = new Set(firstPage.map((message) => message.id));
	const older = pages
		.flat()
		.filter((message) => !seen.has(message.id) && (seen.add(message.id), true));

	return { hasMore, loadMore, loading, older };
}
