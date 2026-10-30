"use client";

import { Bot, Globe2, KeyRound, Mail, Users, ChevronRight } from "lucide-react";

import Link from "@/components/app-link";
import { DatabaseMigrationsNotice } from "@/components/database-migrations-notice";
import { useLanguage } from "@/components/language-provider";
import {
	Item,
	ItemGroup,
	ItemMedia,
	ItemContent,
	ItemTitle,
	ItemDescription,
} from "@/components/ui/item";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { TranslationKey } from "@/lib/i18n/types";

interface AdminSection {
	href: string;
	titleKey: TranslationKey;
	descriptionKey: TranslationKey;
	icon: typeof Bot;
	permission?: "primary" | "domains" | "users";
}

const sections: AdminSection[] = [
	{
		descriptionKey: "admin.section.agent",
		href: "/agent",
		icon: Bot,
		permission: "primary",
		titleKey: "admin.nav.agent",
	},
	{
		descriptionKey: "admin.section.mailboxes",
		href: "/mailboxes",
		icon: Mail,
		titleKey: "admin.nav.mailboxes",
	},
	{
		descriptionKey: "admin.section.domains",
		href: "/domains",
		icon: Globe2,
		permission: "domains",
		titleKey: "admin.nav.domains",
	},
	{
		descriptionKey: "admin.section.accounts",
		href: "/accounts",
		icon: Users,
		titleKey: "admin.nav.accounts",
	},
	{
		descriptionKey: "admin.section.apiKeys",
		href: "/api-keys",
		icon: KeyRound,
		permission: "primary",
		titleKey: "admin.section.apiKeysTitle",
	},
	// {
	// 	href: "/webhooks",
	// 	title: "Webhooks",
	// 	description: "Send mail events to external systems.",
	// 	icon: Webhook,
	// },
	// {
	// 	href: "/settings/account",
	// 	title: "Account",
	// 	description: "View personal account and platform configuration.",
	// 	icon: Settings,
	// },
];

export default function AdminSettingsPage() {
	const { t } = useLanguage();
	const user = useCurrentUser();

	function canSee(section: AdminSection): boolean {
		if (!section.permission) {
			return true;
		}
		if (!user) {
			return false;
		}
		if (section.permission === "primary") {
			return user.isPrimaryAdmin;
		}
		if (section.permission === "domains") {
			return user.isPrimaryAdmin || user.canManageDomains;
		}
		return user.isPrimaryAdmin || user.canManageUsers;
	}

	return (
		<div className="flex flex-col gap-8">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("admin.title")}</PageTitle>
					<PageDescription>{t("admin.description")}</PageDescription>
				</PageHeaderText>
			</PageHeader>
			<ItemGroup className="">
				{sections.filter(canSee).map((section) => {
					const Icon = section.icon;
					return (
						<Item key={section.href} render={<Link href={section.href} />}>
							<ItemMedia variant="icon">
								<Icon />
							</ItemMedia>
							<ItemContent className="min-w-0">
								<ItemTitle>{t(section.titleKey)}</ItemTitle>
								<ItemDescription>{t(section.descriptionKey)}</ItemDescription>
							</ItemContent>
							<ChevronRight className="size-4 text-muted-foreground" />
						</Item>
					);
				})}
			</ItemGroup>
			{user?.isPrimaryAdmin && <DatabaseMigrationsNotice />}
		</div>
	);
}
