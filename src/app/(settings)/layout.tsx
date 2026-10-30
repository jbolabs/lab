"use client";

import { AppTopBar } from "@/components/app-top-bar";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ComposeProvider } from "@/components/compose/compose-context";
import { FloatingComposer } from "@/components/compose/floating-composer";
import { DashboardNav } from "@/components/dashboard-nav";
import { MailSearchProvider } from "@/components/mail-search/mail-search-context";
import { MailSearchInput } from "@/components/mail-search/mail-search-input";
import { MailboxProvider } from "@/components/mailbox-provider";
import { MailboxSelector } from "@/components/mailbox-selector";
import { RouteTitle } from "@/components/route-title";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-context";
import { SidebarAside, MobileMenuButton } from "@/components/sidebar-aside";
import { SidebarProvider } from "@/components/sidebar-state";
import { SkipToContent } from "@/components/skip-to-content";
import { cn as scopeLayoutClasses } from "@/lib/utils";

export default function DashboardLayout({
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
										<DashboardNav />
									</SidebarAside>
									<div className="flex min-h-0 min-w-0 flex-col">
										<AppTopBar className="gap-4 pr-4">
											<MobileMenuButton className="ml-2" />
											<MailSearchInput />
											{/* <Link
                    href="/settings/account"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                  >
                    <HelpCircle className="h-5 w-5" />
                  </Link> */}
											<MailboxSelector />
										</AppTopBar>
										<main
											id="main-content"
											tabIndex={-1}
											className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto overscroll-contain focus:outline-none max-md:rounded-t-lg max-md:bg-card"
										>
											{children}
										</main>
									</div>
									<FloatingComposer />
								</div>
							</ShortcutsProvider>
						</MailSearchProvider>
					</ComposeProvider>
				</MailboxProvider>
			</SidebarProvider>
		</AuthGuard>
	);
}
