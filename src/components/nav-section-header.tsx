"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { readStorage, writeStorage } from "./reorderable-list-utils";

/** Open/closed state of a menu section, remembered in localStorage. Starts open. */
export function useSectionOpen(storageKey: string): [boolean, () => void] {
	const [open, setOpen] = useState(true);
	useEffect(() => {
		setOpen(readStorage(storageKey, true));
	}, [storageKey]);
	function toggle() {
		writeStorage(storageKey, !open);
		setOpen(!open);
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
				className="h-9 min-w-0 flex-1 justify-start px-3 max-md:min-h-11"
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
