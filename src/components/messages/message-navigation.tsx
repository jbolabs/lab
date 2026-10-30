"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";

import type { Message } from "@/hooks/types";
import { primeMessageDetail } from "@/lib/messages/detail-cache";
import { usePathname, useRouter } from "@/lib/navigation";

import type { MessageNavigationState } from "./message-navigation-types";

export function useMessageNavigation(
	href: string,
	message: Message
): MessageNavigationState {
	const pathname = usePathname();
	const router = useRouter();
	const [navigation, setNavigation] = useState<{ from: string } | null>(null);
	let progress: number | null = null;
	if (navigation) {
		progress = navigation.from === pathname ? 12 : 100;
	}

	useEffect(() => {
		if (progress !== 100) {
			return;
		}
		const timer = window.setTimeout(() => setNavigation(null), 220);
		return () => window.clearTimeout(timer);
	}, [progress]);

	function onNavigate(event: MouseEvent<HTMLAnchorElement>, markRead = false) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		primeMessageDetail({ ...message, read: markRead || message.read });
		setNavigation({ from: pathname });
		try {
			router.push(href);
		} catch {
			setNavigation(null);
		}
	}

	return { onNavigate, progress };
}

export function MessageNavigationProgress({
	progress,
}: {
	progress: number | null;
}) {
	if (progress === null) {
		return null;
	}
	return (
		<div className="fixed inset-x-0 top-0 z-[120] h-1 bg-signal-soft">
			<div
				className="h-full [width:var(--mf-width)] bg-primary transition-all duration-100 ease-out"
				style={
					{
						"--mf-width": `${progress}%`,
					} as CSSProperties
				}
			/>
		</div>
	);
}
