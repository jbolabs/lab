"use client";

import { clsx } from "clsx";

import { AdminNav } from "@/components/admin-nav";
import {
	adminPageTitles,
	getAdminBackPath,
} from "@/components/admin-page-titles";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ComposeProvider } from "@/components/compose/compose-context";
import { FloatingComposer } from "@/components/compose/floating-composer";
import { useLanguage } from "@/components/language-provider";
import { MailboxProvider } from "@/components/mailbox-provider";
import { MailboxSelector } from "@/components/mailbox-selector";
import { RouteTitle } from "@/components/route-title";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-context";
import { SidebarAside, MobileTopBar } from "@/components/sidebar-aside";
import { SidebarResizeBoundary } from "@/components/sidebar-resize-boundary";
import { SidebarProvider } from "@/components/sidebar-state";
import { SkipToContent } from "@/components/skip-to-content";
import { usePathname } from "@/lib/navigation";

import { AdminConfirmationProvider } from "./admin-confirmation-provider";

const primaryOnlyPrefixes = [
	"/agent",
	"/api-keys",
	"/webhooks",
	"/backups",
	"/branding",
	"/activity",
	"/audit-logs",
	"/general",
	"/ai-usage",
];

export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { t } = useLanguage();
	const pathname = usePathname();
	const requirePrimary = primaryOnlyPrefixes.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);

	const mobileTitleKey = adminPageTitles[pathname];
	const mobileTitle = mobileTitleKey ? t(mobileTitleKey) : undefined;
	const backPath = getAdminBackPath(pathname);
	const backTitleKey = backPath ? adminPageTitles[backPath] : undefined;
	const mobileBack =
		backPath && backTitleKey
			? {
					href: backPath,
					label: t("message.nav.backTo", { folder: t(backTitleKey) }),
				}
			: undefined;

	return (
		<AuthGuard
			requireMailbox
			requireRole="admin"
			requirePrimary={requirePrimary}
		>
			<SidebarProvider expandedWidth={256} mobileOverlay>
				<MailboxProvider>
					<ComposeProvider>
						<ShortcutsProvider>
							<RouteTitle />
							<div className="grid h-dvh grid-cols-[minmax(0,1fr)] overflow-hidden bg-sidebar transition-all duration-(--sidebar-transition-duration) md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
								<SkipToContent />
								<SidebarAside>
									<div className="h-full">
										<AdminNav />
									</div>
									<SidebarResizeBoundary />
								</SidebarAside>
								<div className="relative flex min-h-0 min-w-0 flex-col">
									<MobileTopBar title={mobileTitle} back={mobileBack} />
									<div className="absolute top-safe-2 right-4 z-10 flex items-center gap-4">
										<MailboxSelector />
									</div>
									<main
										id="main-content"
										tabIndex={-1}
										className={clsx(
											"min-h-0 min-w-0 flex-1 scrollbar-gutter-stable overflow-y-auto overscroll-contain bg-background px-4 py-8 focus:outline-none max-md:pb-safe-add-24 md:px-6 md:pt-16 lg:px-12",
											mobileTitle && "max-md:[&_h1]:sr-only"
										)}
									>
										<div className="mx-auto w-full max-w-5xl">
											<AdminConfirmationProvider>
												{children}
											</AdminConfirmationProvider>
										</div>
									</main>
								</div>
								<FloatingComposer />
							</div>
						</ShortcutsProvider>
					</ComposeProvider>
				</MailboxProvider>
			</SidebarProvider>
		</AuthGuard>
	);
}
