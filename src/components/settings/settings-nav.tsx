"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";
import { SectionNavSheet } from "../section-nav-sheet";
import { isActiveSettingsPath, settingsNavSections } from "./settings-nav-utils";

export function SettingsNav() {
	const { t } = useLanguage();
	const pathname = usePathname();
	const user = useCurrentUser();
	const canManageMailboxes = user?.canManageMailboxes === true;
	const sections = settingsNavSections.map((section) => ({
		...section,
		items: section.items.filter((item) => !item.requiresMailboxAccess || canManageMailboxes),
	}));
	const currentItem = sections.flatMap((section) => section.items).find((item) => isActiveSettingsPath(pathname, item.href));
	const currentLabel = t(currentItem?.labelKey ?? "settings.nav.settings");

	return (
		<SectionNavSheet title={t("settings.nav.menu")} label={currentLabel} className="w-full px-4 py-4 md:min-h-full md:w-64 md:border-r md:border-signal/30 md:py-10">
			<div className="sticky top-6 space-y-7">
				{sections.map((section) => (
					<div key={section.labelKey} className="space-y-3">
						<h2 className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t(section.labelKey)}
						</h2>
						<nav aria-label={t(section.labelKey)} className="space-y-px">
							{section.items.map((item) => {
								const active = isActiveSettingsPath(pathname, item.href);
								return (
									<Link
										key={item.href}
										href={item.href}
										className={cn(
											"block rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
											active
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
				))}
			</div>
		</SectionNavSheet>
	);
}
