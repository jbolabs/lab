"use client";
import { ChevronRight } from "lucide-react";

import Link from "@/components/app-link";
import { useLanguage } from "@/components/language-provider";
import { Item, ItemContent, ItemTitle, ItemGroup } from "@/components/ui/item";
import { PageHeader, PageTitle } from "@/components/ui/page-header";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePathname } from "@/lib/navigation";

import {
	isActiveSettingsPath,
	settingsNavSections,
} from "./settings-nav-utils";

export function SettingsNav() {
	const { t } = useLanguage();
	const pathname = usePathname();
	const user = useCurrentUser();
	return (
		<div className="flex flex-col gap-8 px-5 py-6 md:sticky md:top-0 md:px-4 md:py-10">
			<PageHeader className="md:hidden">
				<PageTitle>{t("settings.nav.settings")}</PageTitle>
			</PageHeader>
			{settingsNavSections.map((section) => (
				<nav key={section.labelKey} aria-label={t(section.labelKey)}>
					<h2 className="mb-3 px-3 text-sm font-medium text-muted-foreground">
						{t(section.labelKey)}
					</h2>
					<ItemGroup className="gap-1">
						{section.items
							.filter(
								(item) =>
									!item.requiresMailboxAccess ||
									user?.canManageMailboxes === true
							)
							.map((item) => {
								const active = isActiveSettingsPath(pathname, item.href);
								return (
									<Item
										key={item.href}
										size="navigation"
										variant={active ? "selected" : "default"}
										render={
											<Link
												href={item.href}
												aria-current={active ? "page" : undefined}
											/>
										}
									>
										<ItemContent>
											<ItemTitle>{t(item.labelKey)}</ItemTitle>
										</ItemContent>
										<ChevronRight className="size-4 text-muted-foreground md:hidden" />
									</Item>
								);
							})}
					</ItemGroup>
				</nav>
			))}
		</div>
	);
}
