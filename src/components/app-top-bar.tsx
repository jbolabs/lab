import type * as React from "react";

import { cn } from "@/lib/utils";

// The top bar of every app shell. On the phone the app runs standalone and draws under the status
// bar, so the bar owns the safe-area inset; shells add only their own spacing and contents.
// `persistent` marks a bar that stays on screen across the shell's pages: it then holds still
// through the phone push/pop transition instead of sliding with the page (globals.css).
export function AppTopBar({
	className,
	persistent = false,
	...props
}: React.ComponentProps<"header"> & { persistent?: boolean }) {
	return (
		<header
			data-slot="app-top-bar"
			data-persistent={persistent || undefined}
			className={cn(
				"flex min-h-14 w-full shrink-0 items-center pt-safe text-sm md:h-16",
				// Painted by the bar itself so its snapshot holds still as one piece.
				persistent && "bg-sidebar",
				className
			)}
			{...props}
		/>
	);
}
