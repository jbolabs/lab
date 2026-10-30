"use client";

import { APP_NAME } from "@/lib/app-identity";
import { cn } from "@/lib/utils";

import { BrandName } from "./brand-name";
import type { BrandApp } from "./brand-name";
import { useBranding } from "./branding-provider";

/** The app icon: the `jbo` tile, or the installation's custom icon. */
export function BrandMark({
	size = 32,
	className,
}: {
	size?: number;
	className?: string;
}) {
	const { iconUrl } = useBranding();
	return (
		<img
			src={iconUrl}
			width={size}
			height={size}
			alt=""
			className={cn(
				"shrink-0 rounded-md object-contain ring-1 ring-foreground/10",
				className
			)}
		/>
	);
}

/** The logo: the tile, then "the lab" or the product you are in ("the inbox", ...). A custom installation name is shown as typed. */
export function Wordmark({
	app,
	className,
}: {
	app?: BrandApp;
	className?: string;
}) {
	const { appName } = useBranding();
	return (
		<span className={cn("flex min-w-0 items-center gap-2.5", className)}>
			<BrandMark size={30} />
			{appName === APP_NAME ? (
				<BrandName app={app} />
			) : (
				<span className="truncate font-display font-semibold tracking-tight">
					{appName}
				</span>
			)}
		</span>
	);
}
