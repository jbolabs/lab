import type * as React from "react";

import { cn } from "@/lib/utils";

// The top bar of every app shell. On the phone the app runs standalone and draws under the status
// bar, so the bar owns the safe-area inset; shells add only their own spacing and contents.
export function AppTopBar({
	className,
	...props
}: React.ComponentProps<"header">) {
	return (
		<header
			data-slot="app-top-bar"
			className={cn(
				"flex min-h-14 w-full shrink-0 items-center pt-safe text-sm md:h-16",
				className
			)}
			{...props}
		/>
	);
}
