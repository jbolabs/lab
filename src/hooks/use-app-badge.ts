import { useEffect, useMemo } from "react";

import { setAppBadgeCount } from "@/lib/push/app-badge";

import { emptyCounts, useMessageCounts } from "./use-message-counts";

export function useAppBadge() {
	const supported = useMemo(
		() => typeof navigator !== "undefined" && "setAppBadge" in navigator,
		[]
	);
	const { counts, isLoading } = useMessageCounts(null, supported);
	const { unread } = counts.folders.inbox;
	// The placeholder (before the first load, or after a failed one) must not clear a badge the service worker set.
	const known = !isLoading && counts !== emptyCounts;

	useEffect(() => {
		if (known) {
			setAppBadgeCount(unread);
		}
	}, [known, unread]);
}
