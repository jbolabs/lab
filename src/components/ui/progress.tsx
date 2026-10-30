"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

import { cn } from "@/lib/utils";

const indicatorVariants = {
	default: "bg-primary",
	destructive: "bg-destructive",
	success: "bg-success",
	warning: "bg-warning",
};

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
	return (
		<ProgressPrimitive.Track
			className={cn(
				"relative flex h-3 w-full items-center overflow-x-hidden rounded-4xl bg-muted",
				className
			)}
			data-slot="progress-track"
			{...props}
		/>
	);
}

function ProgressIndicator({
	className,
	...props
}: ProgressPrimitive.Indicator.Props) {
	return (
		<ProgressPrimitive.Indicator
			data-slot="progress-indicator"
			className={cn("h-full bg-primary transition-all", className)}
			{...props}
		/>
	);
}

function Progress({
	className,
	children,
	value,
	variant = "default",
	...props
}: ProgressPrimitive.Root.Props & {
	variant?: keyof typeof indicatorVariants;
}) {
	return (
		<ProgressPrimitive.Root
			value={value}
			data-slot="progress"
			data-variant={variant}
			className={cn("flex flex-wrap gap-3", className)}
			{...props}
		>
			{children}
			<ProgressTrack>
				<ProgressIndicator className={indicatorVariants[variant]} />
			</ProgressTrack>
		</ProgressPrimitive.Root>
	);
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
	return (
		<ProgressPrimitive.Label
			className={cn("text-sm font-medium", className)}
			data-slot="progress-label"
			{...props}
		/>
	);
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
	return (
		<ProgressPrimitive.Value
			className={cn(
				"ml-auto text-sm text-muted-foreground tabular-nums",
				className
			)}
			data-slot="progress-value"
			{...props}
		/>
	);
}

export {
	Progress,
	ProgressTrack,
	ProgressIndicator,
	ProgressLabel,
	ProgressValue,
};
