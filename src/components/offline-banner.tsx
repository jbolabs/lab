"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useLanguage } from "@/components/language-provider";

function subscribe(onChange: () => void) {
	window.addEventListener("online", onChange);
	window.addEventListener("offline", onChange);
	return () => {
		window.removeEventListener("online", onChange);
		window.removeEventListener("offline", onChange);
	};
}

/** Offline, the service worker answers with saved copies (public/sw.js); say so, so stale mail is never mistaken for new. */
export function OfflineBanner() {
	const { t } = useLanguage();
	const online = useSyncExternalStore(
		subscribe,
		() => navigator.onLine,
		() => true
	);
	if (online) {
		return null;
	}
	return (
		<output className="flex shrink-0 animate-in items-center justify-center gap-2 border-b border-sidebar-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground duration-200 fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
			<WifiOff className="size-3.5" aria-hidden="true" />
			{t("offline.banner")}
		</output>
	);
}
