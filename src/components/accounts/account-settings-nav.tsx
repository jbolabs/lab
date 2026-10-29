"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";
import { SectionNavSheet } from "../section-nav-sheet";
import {
	accountSettingsNavItems,
	getAccountSettingsHref,
	isActiveAccountSettingsPath,
} from "./account-settings-nav-utils";

export function AccountSettingsNav() {
	const { t } = useLanguage();
	const { id } = useParams<{ id: string }>();
	const pathname = usePathname();
	const currentItem = accountSettingsNavItems.find((item) =>
		isActiveAccountSettingsPath(
			pathname,
			getAccountSettingsHref(id, item.segment),
		),
	);
	const currentLabel = t(currentItem?.labelKey ?? "accountSettings.title");

	return (
		<SectionNavSheet
			title={t("accountSettings.menu")}
			label={currentLabel}
			className="w-full shrink-0 px-4 py-4 md:w-48 md:px-0 md:py-0"
		>
			<div className="sticky top-6 flex flex-col gap-3">
				<h2 className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t("accountSettings.title")}
				</h2>
				<nav className="flex flex-col gap-1">
					{accountSettingsNavItems.map((item) => {
						const href = getAccountSettingsHref(id, item.segment);
						return (
							<Link
								key={item.segment || "details"}
								href={href}
								className={cn(
									"block min-h-11 rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
									isActiveAccountSettingsPath(pathname, href)
										? "bg-signal-soft text-signal-soft-foreground"
										: "text-muted-foreground hover:bg-background/70 hover:text-foreground",
								)}
							>
								{t(item.labelKey)}
							</Link>
						);
					})}
				</nav>
			</div>
		</SectionNavSheet>
	);
}
