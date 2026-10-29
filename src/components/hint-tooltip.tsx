"use client";

import type { ReactNode } from "react";

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A text hint for an icon control, composed from the shadcn Tooltip. The trigger is a
 * wrapping span, so any child works and `className` can place it in a layout. No label
 * renders the child alone.
 */
export function HintTooltip({
	label,
	children,
	className,
	side = "bottom",
}: {
	label: null | string;
	children: ReactNode;
	className?: string;
	side?: "top" | "right" | "bottom" | "left";
}) {
	if (!label) {
		return children;
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className={cn("inline-flex", className)}>{children}</span>
			</TooltipTrigger>
			<TooltipContent side={side}>{label}</TooltipContent>
		</Tooltip>
	);
}
