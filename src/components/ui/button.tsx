import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center rounded-4xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		defaultVariants: {
			float: "none",
			shape: "default",
			size: "default",
			variant: "default",
		},
		variants: {
			// A page's primary "New …" action: inline on desktop, a pill floating in thumb reach on phones.
			float: {
				mobile:
					"max-md:fixed max-md:inset-x-4 max-md:bottom-safe-add-4 max-md:z-40 max-md:h-12 max-md:rounded-full max-md:shadow-lg",
				"mobile-above-nav":
					"max-md:fixed max-md:inset-x-4 max-md:bottom-safe-add-20 max-md:z-40 max-md:h-12 max-md:rounded-full max-md:shadow-lg",
				"mobile-end":
					"max-md:fixed max-md:right-4 max-md:bottom-safe-add-4 max-md:z-40 max-md:h-12 max-md:rounded-full max-md:px-5 max-md:shadow-lg",
				none: "",
			},
			shape: {
				default: "",
				pill: "rounded-full",
			},
			// Touch screens get 40-44px targets from the primitive itself, so no surface sizes buttons by hand.
			size: {
				avatar: "size-20 rounded-full p-0",
				default:
					"h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 pointer-coarse:h-11",
				fab: "h-14 gap-2 px-5 text-base has-[>svg]:px-4 pointer-coarse:h-14",
				icon: "size-9 pointer-coarse:size-11",
				"icon-lg": "size-10 pointer-coarse:size-11",
				"icon-sm": "size-8 pointer-coarse:size-10",
				"icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
				lg: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 pointer-coarse:h-11",
				none: "h-auto p-0 has-[>svg]:p-0",
				sm: "h-8 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 pointer-coarse:h-10",
				xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
			},
			variant: {
				// Disabled primaries go flat and muted rather than half-transparent: 50% of near-black
				// (or near-white in dark) reads as a heavy grey slab that outweighs enabled buttons.
				default:
					"bg-primary text-primary-foreground hover:bg-primary/80 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
				destructive:
					"bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
				// Floating action buttons that sit above content (compose, new event).
				floating:
					"bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
				ghost:
					"hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
				link: "text-signal underline-offset-4 hover:underline",
				outline:
					"border-border bg-input/30 hover:bg-input/50 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
				// A whole row or card that behaves as one button; pair with size="none".
				plain:
					"justify-start text-left font-normal whitespace-normal hover:bg-transparent",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
			},
		},
	}
);

export type ButtonProps = ButtonPrimitive.Props &
	VariantProps<typeof buttonVariants>;

function Button({
	className,
	variant = "default",
	size = "default",
	shape = "default",
	float = "none",
	...props
}: ButtonProps) {
	return (
		<ButtonPrimitive
			data-slot="button"
			data-variant={variant}
			data-size={size}
			data-shape={shape}
			className={cn(buttonVariants({ className, float, shape, size, variant }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
