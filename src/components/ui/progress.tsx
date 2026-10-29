"use client";

import { Progress as ProgressPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const indicatorVariants = {
	default: "bg-primary",
	destructive: "bg-destructive",
	success: "bg-success",
	warning: "bg-warning",
};

function Progress({
	className,
	value,
	variant = "default",
	...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
	variant?: keyof typeof indicatorVariants;
}) {
	return (
		<ProgressPrimitive.Root
			data-slot="progress"
			data-variant={variant}
			className={cn(
				"relative flex h-3 w-full items-center overflow-x-hidden rounded-4xl bg-muted",
				className
			)}
			{...props}
		>
			<ProgressPrimitive.Indicator
				data-slot="progress-indicator"
				className={cn(
					"size-full flex-1 bg-primary transition-all",
					indicatorVariants[variant]
				)}
				// oxlint-disable-next-line shadcn/no-inline-styles -- Radix indicator uses the upstream dynamic translate transform for continuous progress.
				style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
			/>
		</ProgressPrimitive.Root>
	);
}

export { Progress };
