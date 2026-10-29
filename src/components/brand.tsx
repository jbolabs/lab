"use client";

import { APP_NAME } from "@/lib/app-identity";
import { cn } from "@/lib/utils";
import { useBranding } from "./branding-provider";

/** The app icon: the `jbo` tile, or the installation's custom icon. */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
	const { iconUrl } = useBranding();
	return <img src={iconUrl} width={size} height={size} alt="" className={cn("shrink-0 rounded-[24%] object-contain ring-1 ring-foreground/10", className)} />;
}

/**
 * The JBO Labs logo in lowercase Montserrat: "jbo" bold, then the suite ("the lab")
 * or the product you are in ("inbox", "drive", ...) hairline. A custom installation
 * name is shown as typed.
 */
export function Wordmark({ product, className }: { product?: string; className?: string }) {
	const { appName } = useBranding();
	if (!product && appName !== APP_NAME) return <span className={cn("truncate font-display font-semibold tracking-tight", className)}>{appName}</span>;
	const suffix = product ?? "the lab";
	return (
		<span className={cn("font-display text-xl leading-none tracking-[-0.03em] text-foreground", className)}>
			<span className="sr-only">{product ? `${APP_NAME} ${product}` : appName}</span>
			<span aria-hidden="true">
				<span className="font-bold">jbo</span>
				<span className="font-extralight">{suffix.toLowerCase()}</span>
			</span>
		</span>
	);
}
