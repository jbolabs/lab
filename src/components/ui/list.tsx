import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@/lib/utils";

export function List({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"grid gap-1 [&>*:first-child]:rounded-t-2xl [&>*:last-child]:rounded-b-2xl",
				className
			)}
			{...props}
		/>
	);
}

export interface ListRowProps extends React.HTMLAttributes<HTMLElement> {
	asChild?: boolean;
}

export function ListRow({
	className,
	asChild = false,
	...props
}: ListRowProps) {
	const Comp: React.ElementType = asChild ? Slot : "div";
	return (
		<Comp
			className={cn(
				"flex items-center gap-4 rounded-2xl bg-card px-4 py-3.5 ring-1 ring-foreground/10",
				className
			)}
			{...props}
		/>
	);
}
