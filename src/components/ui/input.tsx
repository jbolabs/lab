import { Input as InputPrimitive } from "@base-ui/react/input";
import * as React from "react";

import { cn } from "@/lib/utils";

// variant="ghost" drops the border, fill and side padding for inline fields in a padded row (composer From/Subject);
// variant="title" is a borderless heading-sized field (event and booking titles);
// variant="token" is a ghost field that sits on a line of chips (recipient rows). With data-idle set it
// collapses out of the layout until focused, so a row of chips never opens an empty line for it.
function Input({
	className,
	type,
	variant = "default",
	...props
}: React.ComponentProps<"input"> & {
	variant?: "default" | "ghost" | "title" | "token";
}) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			data-variant={variant}
			className={cn(
				"h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 data-[variant=ghost]:border-transparent data-[variant=ghost]:bg-transparent data-[variant=ghost]:px-0 data-[variant=ghost]:shadow-none data-[variant=ghost]:focus-visible:border-transparent data-[variant=ghost]:focus-visible:ring-0 data-[variant=title]:h-auto data-[variant=title]:border-transparent data-[variant=title]:bg-transparent data-[variant=title]:px-0 data-[variant=title]:text-xl data-[variant=title]:font-semibold data-[variant=title]:shadow-none data-[variant=title]:focus-visible:border-transparent data-[variant=title]:focus-visible:ring-0 md:text-sm md:data-[variant=title]:text-2xl dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-[variant=ghost]:bg-transparent dark:data-[variant=title]:bg-transparent pointer-coarse:h-11",
				"data-[variant=token]:h-7 data-[variant=token]:flex-1 data-[variant=token]:border-transparent data-[variant=token]:bg-transparent data-[variant=token]:px-0 data-[variant=token]:shadow-none data-[variant=token]:focus-visible:border-transparent data-[variant=token]:focus-visible:ring-0 dark:data-[variant=token]:bg-transparent pointer-coarse:data-[variant=token]:h-8",
				"data-[variant=token]:data-idle:not-focus:absolute data-[variant=token]:data-idle:not-focus:size-0 data-[variant=token]:data-idle:not-focus:min-w-0 data-[variant=token]:data-idle:not-focus:opacity-0",
				className
			)}
			{...props}
		/>
	);
}

export { Input };
