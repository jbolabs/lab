"use client";

import Link from "@/components/app-link";
import { useLanguage } from "@/components/language-provider";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import { useParams, usePathname } from "@/lib/navigation";

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
			getAccountSettingsHref(id, item.segment)
		)
	);
	const currentLabel = t(currentItem?.labelKey ?? "accountSettings.title");

	return (
		<SectionNavSheet
			title={t("accountSettings.menu")}
			label={currentLabel}
			className="w-full shrink-0 px-4 py-4 md:w-48 md:px-0 md:py-0"
		>
			<div className="sticky top-6 flex flex-col gap-3">
				<h2 className="px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					{t("accountSettings.title")}
				</h2>
				<nav className="flex flex-col gap-1">
					{accountSettingsNavItems.map((item) => {
						const href = getAccountSettingsHref(id, item.segment);
						const active = isActiveAccountSettingsPath(pathname, href);
						return (
							<Item
								key={item.segment || "details"}
								size="navigation"
								variant={active ? "selected" : "default"}
								render={
									<Link
										href={href}
										aria-current={active ? "page" : undefined}
									/>
								}
							>
								<ItemContent>
									<ItemTitle>{t(item.labelKey)}</ItemTitle>
								</ItemContent>
							</Item>
						);
					})}
				</nav>
			</div>
		</SectionNavSheet>
	);
}
