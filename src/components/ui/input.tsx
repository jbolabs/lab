import * as React from "react";

import { cn } from "@/lib/utils";

// variant="ghost" drops the border, fill and side padding for inline fields in a padded row (composer From/Subject);
// variant="title" is a borderless heading-sized field (event and booking titles).
function Input({
	className,
	type,
	variant = "default",
	...props
}: React.ComponentProps<"input"> & {
	variant?: "default" | "ghost" | "title";
}) {
	return (
		<input
			type={type}
			data-slot="input"
			data-variant={variant}
			className={cn(
				"h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 data-[variant=ghost]:border-transparent data-[variant=ghost]:bg-transparent data-[variant=ghost]:px-0 data-[variant=ghost]:shadow-none data-[variant=ghost]:focus-visible:border-transparent data-[variant=ghost]:focus-visible:ring-0 data-[variant=title]:h-auto data-[variant=title]:border-transparent data-[variant=title]:bg-transparent data-[variant=title]:px-0 data-[variant=title]:text-xl data-[variant=title]:font-semibold data-[variant=title]:shadow-none data-[variant=title]:focus-visible:border-transparent data-[variant=title]:focus-visible:ring-0 md:text-sm md:data-[variant=title]:text-2xl dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-[variant=ghost]:bg-transparent dark:data-[variant=title]:bg-transparent pointer-coarse:h-11",
				className
			)}
			{...props}
		/>
	);
}

export { Input };
