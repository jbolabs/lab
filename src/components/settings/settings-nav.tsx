"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Item, ItemContent, ItemTitle, ItemGroup } from "@/components/ui/item";
import { cn } from "@/lib/utils";
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
			<h1 className="text-2xl font-semibold tracking-tight md:hidden">
				{t("settings.nav.settings")}
			</h1>
			{settingsNavSections.map((section) => (
				<nav key={section.labelKey} aria-label={t(section.labelKey)}>
					<h2 className="mb-3 px-3 text-sm font-medium text-muted-foreground">
						{t(section.labelKey)}
					</h2>
					<ItemGroup className="gap-1 max-md:divide-y max-md:rounded-lg max-md:border">
						{section.items
							.filter(
								(item) =>
									!item.requiresMailboxAccess ||
									user?.canManageMailboxes === true,
							)
							.map((item) => {
								const active = isActiveSettingsPath(pathname, item.href);
								return (
									<Item
										asChild
										key={item.href}
										size="sm"
										className={cn(
											"min-h-11",
											active && "bg-signal-soft text-signal-soft-foreground",
										)}
									>
										<Link
											href={item.href}
											aria-current={active ? "page" : undefined}
										>
											<ItemContent>
												<ItemTitle>{t(item.labelKey)}</ItemTitle>
											</ItemContent>
											<ChevronRight className="size-4 text-muted-foreground md:hidden" />
										</Link>
									</Item>
								);
							})}
					</ItemGroup>
				</nav>
			))}
		</div>
	);
}
