"use client";

import { ChevronRight } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { readStorage, writeStorage } from "./reorderable-list-utils";

/** Open/closed state of a menu section, remembered in localStorage. Starts open. */
export function useSectionOpen(
	storageKey: string,
	defaultOpen = true
): [boolean, () => void] {
	const subscribe = useCallback((notify: () => void) => {
		window.addEventListener("storage", notify);
		window.addEventListener("mailflare:section-preference", notify);
		return () => {
			window.removeEventListener("storage", notify);
			window.removeEventListener("mailflare:section-preference", notify);
		};
	}, []);
	const snapshot = useCallback(
		() => readStorage(storageKey, defaultOpen),
		[storageKey, defaultOpen]
	);
	const open = useSyncExternalStore(subscribe, snapshot, () => defaultOpen);
	function toggle() {
		writeStorage(storageKey, !open);
		window.dispatchEvent(new Event("mailflare:section-preference"));
	}
	return [open, toggle];
}

/** Collapsible section label: small uppercase text behind a chevron that turns when the section opens. */
export function NavSectionHeader({
	label,
	open,
	onToggle,
	children,
}: {
	label: string;
	open: boolean;
	onToggle: () => void;
	children?: ReactNode;
}) {
	return (
		<div className="mt-3 flex min-h-9 shrink-0 items-center justify-between gap-1">
			<Button
				variant="ghost"
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				size="default"
				className="min-w-0 flex-1 justify-start"
			>
				<ChevronRight
					className={cn("shrink-0 transition-transform", open && "rotate-90")}
				/>
				<span className="truncate">{label}</span>
			</Button>
			{children}
		</div>
	);
}
