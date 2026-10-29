"use client";

import { Suspense } from "react";

import { AuthGuard } from "@/components/auth/auth-guard";
import { ComposeProvider } from "@/components/compose/compose-context";
import { MailSearchProvider } from "@/components/mail-search/mail-search-context";
import { MailboxProvider } from "@/components/mailbox-provider";
import { MailboxSelector } from "@/components/mailbox-selector";
import { RouteTitle } from "@/components/route-title";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-context";
import { SidebarAside, MobileMenuButton } from "@/components/sidebar-aside";
import { SidebarHeader } from "@/components/sidebar-header";
import { SidebarResizeBoundary } from "@/components/sidebar-resize-boundary";
import { SidebarProvider, useSidebar } from "@/components/sidebar-state";
import { SkipToContent } from "@/components/skip-to-content";
import { cn as scopeLayoutClasses } from "@/lib/utils";

import { DriveMobileNew } from "./drive-mobile-new";
import { DriveNav } from "./drive-nav";

function DriveFrame({ children }: { children: React.ReactNode }) {
	const { mobile, toggle } = useSidebar();
	// Same grid and sidebar width as the dashboard, so the menu and the search line up and resizing carries over.
	return (
		<div
			className={scopeLayoutClasses(
				scopeLayoutClasses(
					"grid h-dvh grid-cols-1 overflow-hidden bg-sidebar",
					"transition-[grid-template-columns]",
					"md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]"
				),
				"duration-(--layout-duration)"
			)}
			style={
				{
					"--layout-duration": "var(--sidebar-transition-duration)",
				} as React.CSSProperties
			}
		>
			<SkipToContent />
			<SidebarAside>
				<div className="flex h-full min-h-0 flex-col">
					<div className="shrink-0 px-3 pt-4">
						<SidebarHeader href="/" app="drive" />
					</div>
					<Suspense fallback={null}>
						<DriveNav onNavigate={mobile ? toggle : undefined} />
					</Suspense>
				</div>
				<SidebarResizeBoundary />
			</SidebarAside>
			<div className="flex min-h-0 min-w-0 flex-col">
				<header className="flex h-16 w-full shrink-0 items-center gap-3 pr-4 text-sm">
					<MobileMenuButton className="ml-2" />
					<div
						id="drive-header-slot"
						className="flex min-w-0 flex-1 items-center"
					/>
					<MailboxSelector />
				</header>
				<main
					id="main-content"
					tabIndex={-1}
					className="min-h-0 min-w-0 flex-1 overflow-hidden focus:outline-none md:pr-4"
				>
					{children}
				</main>
				{/* Always mounted (hidden from md up) so it keeps the folder permissions it has heard across rotations. */}
				<Suspense fallback={null}>
					<DriveMobileNew />
				</Suspense>
			</div>
		</div>
	);
}

export default function DriveLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AuthGuard>
			<SidebarProvider mobileOverlay>
				<MailboxProvider>
					<ComposeProvider>
						<MailSearchProvider>
							<ShortcutsProvider>
								<RouteTitle />
								<DriveFrame>{children}</DriveFrame>
							</ShortcutsProvider>
						</MailSearchProvider>
					</ComposeProvider>
				</MailboxProvider>
			</SidebarProvider>
		</AuthGuard>
	);
}
