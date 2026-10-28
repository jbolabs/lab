"use client";

import { APP_NAME } from "@/lib/app-identity";
import { cn } from "@/lib/utils";
import { useBranding } from "./branding-provider";

/** The app icon: the JBO Labs `jbo` tile, or the installation's custom icon. */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
	const { iconUrl } = useBranding();
	return <img src={iconUrl} width={size} height={size} alt="" className={cn("shrink-0 rounded-[24%] object-contain ring-1 ring-foreground/10", className)} />;
}

/**
 * The name set like the JBO Labs logo: lowercase Montserrat, `jbo` bold and the
 * product name hairline ("jbolab"). A custom installation name is shown as typed.
 */
export function Wordmark({ name, className }: { name?: string; className?: string }) {
	const branding = useBranding();
	const appName = name ?? branding.appName;
	if (appName !== APP_NAME) return <span className={cn("truncate font-display font-semibold tracking-tight", className)}>{appName}</span>;
	return (
		<span className={cn("font-display text-xl leading-none tracking-[-0.03em] text-foreground", className)}>
			<span className="sr-only">{appName}</span>
			<span aria-hidden="true">
				<span className="font-bold">jbo</span>
				<span className="font-extralight">{appName.toLowerCase()}</span>
			</span>
		</span>
	);
}
