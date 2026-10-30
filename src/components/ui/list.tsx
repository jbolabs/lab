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
