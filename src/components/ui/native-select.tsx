import { ChevronDownIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

// A select needs a name: an `id` its <label htmlFor> points at, or an explicit ARIA name.
type SelectName =
	| { id: string }
	| { "aria-label": string }
	| { "aria-labelledby": string };

function NativeSelect({
	className,
	size = "default",
	variant = "default",
	containerClassName,
	...props
}: Omit<React.ComponentProps<"select">, "size"> & {
	size?: "sm" | "default";
	variant?: "default" | "ghost";
	containerClassName?: string;
} & SelectName) {
	return (
		<div
			className={cn(
				"group/native-select relative w-fit has-[select:disabled]:opacity-50",
				containerClassName
			)}
			data-slot="native-select-wrapper"
			data-size={size}
		>
			<select
				data-slot="native-select"
				data-size={size}
				data-variant={variant}
				className={cn(
					"h-9 w-full min-w-0 appearance-none rounded-4xl border border-input bg-input/30 py-1 pr-8 pl-3 text-base transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 data-[size=sm]:h-8 data-[variant=ghost]:border-transparent data-[variant=ghost]:bg-transparent data-[variant=ghost]:pl-0 data-[variant=ghost]:shadow-none data-[variant=ghost]:focus-visible:border-transparent data-[variant=ghost]:focus-visible:ring-0 md:text-sm dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-[variant=ghost]:bg-transparent dark:data-[variant=ghost]:hover:bg-transparent pointer-coarse:h-11 pointer-coarse:data-[size=sm]:h-10",
					className
				)}
				{...props}
			/>
			<ChevronDownIcon
				className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground opacity-50 select-none"
				aria-hidden="true"
				data-slot="native-select-icon"
			/>
		</div>
	);
}

function NativeSelectOption({
	className,
	...props
}: React.ComponentProps<"option">) {
	return (
		<option
			data-slot="native-select-option"
			className={cn("bg-[Canvas] text-[CanvasText]", className)}
			{...props}
		/>
	);
}

function NativeSelectOptGroup({
	className,
	...props
}: React.ComponentProps<"optgroup">) {
	return (
		<optgroup
			data-slot="native-select-optgroup"
			className={cn("bg-[Canvas] text-[CanvasText]", className)}
			{...props}
		/>
	);
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
