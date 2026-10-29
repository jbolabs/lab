import * as React from "react";

import { cn } from "@/lib/utils";

// variant="ghost" drops the border and fill for full-page editors (documents, event notes).
function Textarea({
	className,
	variant = "default",
	...props
}: React.ComponentProps<"textarea"> & {
	variant?: "default" | "ghost";
}) {
	return (
		<textarea
			data-slot="textarea"
			data-variant={variant}
			className={cn(
				"flex field-sizing-content min-h-16 w-full resize-none rounded-xl border border-input bg-input/30 px-3 py-3 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 data-[variant=ghost]:border-transparent data-[variant=ghost]:bg-transparent data-[variant=ghost]:shadow-none data-[variant=ghost]:focus-visible:border-transparent data-[variant=ghost]:focus-visible:ring-0 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:data-[variant=ghost]:bg-transparent",

				className
			)}
			{...props}
		/>
	);
}

export { Textarea };
