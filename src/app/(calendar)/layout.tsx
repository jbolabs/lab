"use client";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { layoutLength } from "@/app/layout-values";
import { AgentPanel } from "@/components/agent/agent-panel";
import { AssistantOpenContext } from "@/components/agent/assistant-open-state";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ComposeProvider } from "@/components/compose/compose-context";
import { FloatingComposer } from "@/components/compose/floating-composer";
import { useLanguage } from "@/components/language-provider";
import { MailSearchProvider } from "@/components/mail-search/mail-search-context";
import { MailboxProvider } from "@/components/mailbox-provider";
import { MailboxSelector } from "@/components/mailbox-selector";
import { RouteTitle } from "@/components/route-title";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-context";
import { SidebarAside, MobileMenuButton } from "@/components/sidebar-aside";
import { SidebarHeader } from "@/components/sidebar-header";
import { SidebarProvider } from "@/components/sidebar-state";
import { SkipToContent } from "@/components/skip-to-content";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn as clsx } from "@/lib/utils";

import { useDashboardState } from "../(dashboard)/dashboard-state";
import { useAssistantAvailability } from "../(dashboard)/use-assistant-availability";
import { CalendarMobileUpcoming } from "./calendar-mobile-upcoming";

export default function CalendarLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { t } = useLanguage();
	const pathname = usePathname();
	const router = useRouter();
	const {
		assistantOpen,
		setAssistantOpen,
		assistantFullSize,
		setAssistantFullSize,
	} = useDashboardState();
	const assistantEnabled = useAssistantAvailability();
	const assistantVisible = assistantEnabled === true && assistantOpen;

	useEffect(() => {
		if (assistantEnabled === false && (assistantOpen || assistantFullSize)) {
			setAssistantOpen(false);
			setAssistantFullSize(false);
		}
	}, [
		assistantEnabled,
		assistantOpen,
		assistantFullSize,
		setAssistantOpen,
		setAssistantFullSize,
	]);

	function renderCalendarWorkspace() {
		return (
			<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
				<AssistantOpenContext.Provider value={assistantVisible}>
					<main
						id="main-content"
						tabIndex={-1}
						className="min-h-0 min-w-0 flex-1 scrollbar-gutter-stable overflow-hidden overscroll-contain bg-sidebar focus:outline-none"
						aria-hidden={assistantVisible && assistantFullSize}
						inert={assistantVisible && assistantFullSize}
					>
						<div
							key={pathname}
							className="page-transition-enter h-full min-h-0"
						>
							{children}
						</div>
					</main>
				</AssistantOpenContext.Provider>
				<aside
					className={clsx(
						clsx(
							assistantFullSize ? "pl-0" : "pl-4",
							"min-h-0 min-w-0 shrink-0 overflow-hidden pr-2 pb-2 transition-all duration-300 ease-in-out motion-reduce:transition-none max-md:p-0",
							assistantVisible ? "" : "opacity-0"
						),
						"w-(--layout-width)"
					)}
					style={
						{
							"--layout-width": layoutLength(
								(() => {
									if (assistantVisible) {
										if (assistantFullSize) {
											return "100%";
										}
										return "min(390px, 100%)";
									}
									return "0px";
								})()
							),
						} as React.CSSProperties
					}
					aria-hidden={!assistantVisible}
					inert={!assistantVisible}
				>
					{assistantEnabled && (
						<AgentPanel
							open={assistantVisible}
							fullSize={assistantFullSize}
							onToggleFullSize={() =>
								setAssistantFullSize((current) => !current)
							}
							onClose={() => {
								setAssistantOpen(false);
								setAssistantFullSize(false);
							}}
						/>
					)}
				</aside>
			</div>
		);
	}
	return (
		<AuthGuard>
			<SidebarProvider mobileOverlay>
				<MailboxProvider>
					<ComposeProvider>
						<MailSearchProvider>
							<ShortcutsProvider>
								<RouteTitle />
								<div className="grid h-dvh grid-cols-1 overflow-hidden bg-sidebar">
									<SkipToContent />
									<SidebarAside className="md:hidden">
										<CalendarMobileUpcoming />
									</SidebarAside>
									<div className="flex min-h-0 min-w-0 flex-col">
										<header className="flex h-16 w-full shrink-0 items-center gap-3 pr-4 text-sm max-md:h-auto max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-2 max-md:pt-1 max-md:pr-2 max-md:pb-2">
											<MobileMenuButton className="ml-1" />
											<div
												className={clsx(
													"hidden shrink-0 px-3 md:block [&>div]:mb-0",
													"w-(--layout-width)"
												)}
												style={
													{
														"--layout-width": layoutLength(
															"calc(var(--sidebar-width) + 1.5rem)"
														),
													} as React.CSSProperties
												}
											>
												<SidebarHeader href="/" app="calendar" />
											</div>
											<div className="mr-auto shrink-0 md:hidden">
												<NativeSelect
													size="sm"
													containerClassName="w-fit"
													aria-label={t("calendar.sectionLabel")}
													value={
														pathname === "/booking" ? "/booking" : "/calendar"
													}
													onChange={(event) => router.push(event.target.value)}
													className="max-w-full"
												>
													<option value="/booking">
														{t("calendar.bookings")}
													</option>
													<option value="/calendar">
														{t("calendar.calendar")}
													</option>
												</NativeSelect>
											</div>
											<div className="flex min-w-0 flex-1 items-center gap-3 max-md:contents md:overflow-x-auto">
												<nav
													aria-label={t("calendar.sections")}
													className="flex shrink-0 items-center gap-1 rounded-lg bg-card p-1 max-md:hidden"
												>
													<Button
														size="sm"
														variant={
															pathname === "/booking" ? "default" : "ghost"
														}
														className={clsx(
															pathname !== "/booking" && "text-muted-foreground"
														)}
														render={
															<Link
																href="/booking"
																aria-current={
																	pathname === "/booking" ? "page" : undefined
																}
															/>
														}
														nativeButton={false}
													>
														{t("calendar.bookings")}
													</Button>
													<Button
														size="sm"
														variant={
															pathname === "/calendar" ? "default" : "ghost"
														}
														className={clsx(
															pathname !== "/calendar" &&
																"text-muted-foreground"
														)}
														render={
															<Link
																href="/calendar"
																aria-current={
																	pathname === "/calendar" ? "page" : undefined
																}
															/>
														}
														nativeButton={false}
													>
														{t("calendar.calendar")}
													</Button>
												</nav>
												<div
													id="calendar-header-slot"
													className="flex min-w-0 flex-1 items-center max-md:order-last max-md:basis-full max-md:pl-3 max-md:empty:hidden md:min-w-max"
												/>
											</div>
											{assistantEnabled && (
												<Button
													type="button"
													variant={assistantOpen ? "secondary" : "ghost"}
													size="icon-sm"
													className={
														assistantOpen ? "" : "text-muted-foreground"
													}
													onClick={() => {
														setAssistantOpen((current) => !current);
														setAssistantFullSize(false);
													}}
													aria-label={
														assistantOpen
															? t("agent.assistant.close")
															: t("agent.assistant.open")
													}
													aria-expanded={assistantOpen}
													aria-controls="email-assistant-panel"
												>
													<Sparkles data-icon="inline-start" />
												</Button>
											)}
											<MailboxSelector />
										</header>
										{renderCalendarWorkspace()}
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
