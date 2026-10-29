"use client";

import {
	DatabaseBackup,
	Globe2,
	Activity,
	Mail,
	Settings,
	Users,
	Route,
	Webhook,
	KeyRound,
	Bot,
	Palette,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { TranslationKey } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

import { NavItem } from "./components-nav";
import type { NavLink } from "./components-nav-types";
import { useLanguage } from "./language-provider";
import { NavSectionHeader, useSectionOpen } from "./nav-section-header";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarHeader } from "./sidebar-header";
import { SidebarScaffold } from "./sidebar-scaffold";
import { useSidebar } from "./sidebar-state";

type AdminLinkPermission = "primary" | "domains" | "users";

interface AdminNavLink {
	href: string;
	labelKey: TranslationKey;
	icon: typeof Settings;
	permission?: AdminLinkPermission;
}

// `id` names a section for its remembered open/closed state; it is not shown.
const sections: {
	id?: string;
	labelKey?: TranslationKey;
	links: AdminNavLink[];
}[] = [
	{
		// label: "Overview",
		links: [{ href: "/admin", icon: Settings, labelKey: "admin.nav.overview" }],
	},
	{
		id: "Email",
		labelKey: "admin.nav.email",
		links: [
			{ href: "/mailboxes", icon: Mail, labelKey: "admin.nav.mailboxes" },
			{
				href: "/domains",
				icon: Globe2,
				labelKey: "admin.nav.domains",
				permission: "domains",
			},
			{
				href: "/routing",
				icon: Route,
				labelKey: "admin.nav.routing",
				permission: "domains",
			},
			{
				href: "/webhooks",
				icon: Webhook,
				labelKey: "admin.nav.webhooks",
				permission: "primary",
			},
		],
	},
	{
		id: "Administration",
		labelKey: "admin.nav.administration",
		links: [
			{
				href: "/api-keys",
				icon: KeyRound,
				labelKey: "admin.nav.apiKeys",
				permission: "primary",
			},
			{
				href: "/general",
				icon: Settings,
				labelKey: "admin.nav.general",
				permission: "primary",
			},
			{
				href: "/agent",
				icon: Bot,
				labelKey: "admin.nav.agent",
				permission: "primary",
			},
			{ href: "/accounts", icon: Users, labelKey: "admin.nav.accounts" },
			{
				href: "/activity",
				icon: Activity,
				labelKey: "admin.nav.activity",
				permission: "primary",
			},
			{
				href: "/backups",
				icon: DatabaseBackup,
				labelKey: "admin.nav.backups",
				permission: "primary",
			},
			{
				href: "/branding",
				icon: Palette,
				labelKey: "admin.nav.branding",
				permission: "primary",
			},
		],
	},
];

function AdminSection({
	id,
	label,
	links,
	showDivider,
	minimal,
}: {
	id?: string;
	label?: string;
	links: NavLink[];
	showDivider: boolean;
	minimal: boolean;
}) {
	const [open, toggle] = useSectionOpen(
		`mailflare:nav:admin-section-open:${id ?? ""}`
	);
	// Unlabelled sections have nothing to toggle; the icon rail always shows everything.
	const expanded = minimal || !label || open;
	return (
		<section>
			{showDivider && <Separator className="mb-3" />}
			{!minimal && label && (
				<NavSectionHeader label={label} open={open} onToggle={toggle} />
			)}
			{expanded && (
				<div className="flex flex-col gap-px">
					{links.map((link) => (
						<NavItem link={link} key={link.href} />
					))}
				</div>
			)}
		</section>
	);
}

export function AdminNav({ className }: { className?: string }) {
	const { t } = useLanguage();
	const { minimal } = useSidebar();
	const user = useCurrentUser();

	function canSee(link: AdminNavLink): boolean {
		if (!link.permission) {
			return true;
		}
		if (!user) {
			return false;
		}
		if (link.permission === "primary") {
			return user.isPrimaryAdmin;
		}
		if (link.permission === "domains") {
			return user.isPrimaryAdmin || user.canManageDomains;
		}
		return user.isPrimaryAdmin || user.canManageUsers;
	}

	return (
		<SidebarScaffold
			className={className}
			header={<SidebarHeader href="/" />}
			footer={<SidebarFooter />}
		>
			<div className={cn("flex flex-col gap-4", minimal && "gap-2")}>
				{sections.map((section, sectionIndex) => {
					const links = section.links
						.filter(canSee)
						.map(({ labelKey, ...link }): NavLink => ({
							...link,
							label: t(labelKey),
						}));
					if (links.length === 0) {
						return null;
					}

					return (
						// The first section has no label, so fall back to its first href for a stable key.
						<AdminSection
							key={section.id ?? links[0].href}
							id={section.id}
							label={section.labelKey ? t(section.labelKey) : undefined}
							links={links}
							showDivider={minimal && sectionIndex > 0}
							minimal={minimal}
						/>
					);
				})}
			</div>
		</SidebarScaffold>
	);
}
