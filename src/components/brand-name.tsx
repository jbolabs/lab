import { APP_NAME } from "@/lib/app-identity";
import { cn } from "@/lib/utils";

/** What each JBO Labs product is called beside the `jbo` tile: "the lab" for the suite, "the inbox" for mail, and so on. */
export const BRAND_NAMES = {
	calendar: "cal",
	drive: "files",
	inbox: "inbox",
	lab: "lab",
} as const;

export type BrandApp = keyof typeof BRAND_NAMES;

/**
 * "the <name>" in the JBO Labs type: lowercase Montserrat, "the" hairline and the
 * name bold. The `jbo` tile beside it says the rest, so the word "jbo" never repeats.
 * Free of hooks so server pages can set it too.
 */
export function BrandName({
	app = "lab",
	className,
}: {
	app?: BrandApp;
	className?: string;
}) {
	const name = BRAND_NAMES[app];
	return (
		<span
			className={cn(
				"font-display text-xl leading-none tracking-tight text-foreground",
				className
			)}
		>
			<span className="sr-only">
				{app === "lab" ? APP_NAME : `${APP_NAME} ${name}`}
			</span>
			<span aria-hidden="true">
				<span className="font-extralight">the </span>
				<span className="font-bold">{name}</span>
			</span>
		</span>
	);
}
