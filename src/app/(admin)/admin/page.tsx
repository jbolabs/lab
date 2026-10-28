"use client";

import Link from "next/link";
import { BadgeDollarSign, Bot, Globe2, KeyRound, Mail, Palette, Users } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { TranslationKey } from "@/lib/i18n/types";
import { AdminUpdateCard } from "@/components/admin-update-card";
import { Item, ItemGroup, ItemMedia, ItemContent, ItemTitle, ItemDescription } from "@/components/ui/item";
import { ChevronRight } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

type AdminSection = {
	href: string;
	titleKey: TranslationKey;
	descriptionKey: TranslationKey;
	icon: typeof Bot;
	permission?: "primary" | "domains" | "users";
};

const sections: AdminSection[] = [
	{
		href: "/agent",
		titleKey: "admin.nav.agent",
		descriptionKey: "admin.section.agent",
		icon: Bot,
		permission: "primary",
	},
	{
		href: "/mailboxes",
		titleKey: "admin.nav.mailboxes",
		descriptionKey: "admin.section.mailboxes",
		icon: Mail,
	},
	{
		href: "/domains",
		titleKey: "admin.nav.domains",
		descriptionKey: "admin.section.domains",
		icon: Globe2,
		permission: "domains",
	},
	{
		href: "/branding",
		titleKey: "admin.nav.branding",
		descriptionKey: "admin.section.branding",
		icon: Palette,
		permission: "primary",
	},
	{
		href: "/licenses",
		titleKey: "admin.nav.licenses",
		descriptionKey: "admin.section.licenses",
		icon: BadgeDollarSign,
		permission: "primary",
	},
	{
		href: "/accounts",
		titleKey: "admin.nav.accounts",
		descriptionKey: "admin.section.accounts",
		icon: Users,
	},
	{
		href: "/api-keys",
		titleKey: "admin.section.apiKeysTitle",
		descriptionKey: "admin.section.apiKeys",
		icon: KeyRound,
		permission: "primary",
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
		if (!section.permission) return true;
		if (!user) return false;
		if (section.permission === "primary") return user.isPrimaryAdmin;
		if (section.permission === "domains") return user.isPrimaryAdmin || user.canManageDomains;
		return user.isPrimaryAdmin || user.canManageUsers;
	}

	return (
		<div>
			<div className="mb-8">
				<h1 className="text-2xl md:text-3xl font-medium text-foreground">{t("admin.title")}</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					{t("admin.description")}
				</p>
			</div>
			<ItemGroup className="divide-y rounded-lg border bg-card">
				{sections.filter(canSee).map((section) => {
					const Icon = section.icon;
					return <Item asChild key={section.href}>
						<Link href={section.href}>
							<ItemMedia variant="icon"><Icon /></ItemMedia>
							<ItemContent className="min-w-0"><ItemTitle>{t(section.titleKey)}</ItemTitle><ItemDescription>{t(section.descriptionKey)}</ItemDescription></ItemContent>
							<ChevronRight className="size-4 text-muted-foreground" />
						</Link>
					</Item>;
				})}
			</ItemGroup>
			{user?.isPrimaryAdmin && (
				<div className="mt-8">
					<AdminUpdateCard />
				</div>
			)}
		</div>
	);
}
