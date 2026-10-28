import type { Metadata } from "next";
import Link from "next/link";
import { Search, SquarePen } from "lucide-react";
import { getServerTranslator } from "@/lib/i18n/server";
import { APP_NAME } from "@/lib/app-identity";
import { LanguageSelector } from "@/components/language-selector";
import { cn } from "@/lib/utils";
import { heroMessages, sidebarItems } from "./utils";
import { getHomeBranding } from "./home-server-utils";
import { HomeAuthProvider } from "./home-auth";
import { HomeHeaderActions } from "./home-header-actions";
import { HomeHeroActions } from "./home-hero-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
	const branding = await getHomeBranding();
	return {
		title: branding.appName,
		icons: { icon: branding.hasCustomIcon ? "/api/branding/icon" : "/icon-96.png" },
	};
}

/** `*text*` in a headline is set bold against the hairline display weight, as on jbolabs.com. */
function Headline({ text }: { text: string }) {
	return text.split("*").map((segment, index) => (index % 2 ? <strong key={index} className="font-bold tracking-[-0.035em]">{segment}</strong> : segment));
}

export default async function HomePage() {
	const branding = await getHomeBranding();
	const t = await getServerTranslator();
	const iconUrl = branding.hasCustomIcon ? "/api/branding/icon" : "/icon-96.png";

	return (
		<HomeAuthProvider>
			<div className="flex min-h-svh flex-col bg-background text-foreground">
				<header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-[env(safe-area-inset-top)] sm:px-8">
					<Link href="/" className="flex h-16 items-center gap-2.5" aria-label={t("home.homeLabel", { app: branding.appName })}>
						<img src={iconUrl} height={30} width={30} alt="" className="rounded-[24%]" />
						{branding.appName === APP_NAME ? (
							<span aria-hidden="true" className="font-display text-xl leading-none tracking-[-0.03em]">
								<span className="font-bold">jbo</span>
								<span className="font-extralight">{APP_NAME.toLowerCase()}</span>
							</span>
						) : (
							<span className="font-display text-lg font-semibold tracking-tight">{branding.appName}</span>
						)}
					</Link>
					<div className="flex items-center gap-2">
						<div className="hidden sm:block">
							<LanguageSelector variant="text" />
						</div>
						<HomeHeaderActions />
					</div>
				</header>

				<main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-14 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:py-16">
					<div className="flex h-full flex-col justify-between gap-12 lg:h-auto lg:justify-center">
						<div>
							<p className="home-rise font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("home.badge")}</p>
							<h1 className="home-rise mt-6 max-w-xl font-display text-[2.6rem] font-extralight leading-[1.05] tracking-[-0.03em] [animation-delay:60ms] sm:text-6xl sm:leading-[1.02]">
								<Headline text={t("home.headline")} />
							</h1>
							<p className="home-rise mt-7 max-w-md text-lg leading-relaxed text-muted-foreground [animation-delay:120ms]">{t("home.subheadline")}</p>
						</div>
						<HomeHeroActions />
					</div>

					<div aria-hidden="true" className="home-rise hidden select-none [animation-delay:200ms] md:block">
						<div className="overflow-hidden rounded-2xl border bg-sidebar shadow-[0_32px_80px_-48px_oklch(0.18_0.012_265/0.45)]">
							<div className="grid grid-cols-[168px_1fr]">
								<aside className="flex flex-col gap-1 p-3 pt-4">
									<div className="mb-3 flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
										<SquarePen className="size-4" />
										{t("navigation.compose")}
									</div>
									{sidebarItems.map((item) => {
										const Icon = item.icon;
										return (
											<div key={item.labelKey} className={cn("flex h-8 items-center justify-between rounded-lg px-2.5 text-sm", item.active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground")}>
												<span className="flex items-center gap-2.5">
													<Icon className="size-4" />
													{t(item.labelKey)}
												</span>
												{item.count && <span className="font-mono text-xs text-muted-foreground">{item.count}</span>}
											</div>
										);
									})}
								</aside>
								<div className="m-2 ml-0 flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
									<div className="flex h-12 items-center gap-2.5 border-b px-4 text-sm text-muted-foreground">
										<Search className="size-4" />
										{t("search.mail")}
									</div>
									<ul className="divide-y">
										{heroMessages.map((message) => (
											<li key={message.sender} className="flex gap-3 px-4 py-3.5">
												<span className={cn("mt-1.5 size-2 shrink-0 rounded-full", message.unread ? "bg-signal" : "bg-transparent")} />
												<div className="min-w-0 flex-1">
													<div className="flex items-baseline justify-between gap-3">
														<span className={cn("truncate text-sm", message.unread ? "font-semibold text-foreground" : "text-foreground/80")}>{message.sender}</span>
														<span className="shrink-0 font-mono text-[11px] text-muted-foreground">{message.time}</span>
													</div>
													<p className={cn("truncate text-sm", message.unread ? "font-medium text-foreground" : "text-foreground/80")}>{message.subject}</p>
													<p className="truncate text-sm text-muted-foreground">{message.preview}</p>
												</div>
											</li>
										))}
									</ul>
								</div>
							</div>
						</div>
					</div>
				</main>

				<footer className="mx-auto hidden w-full max-w-6xl items-center justify-between px-8 pb-8 text-xs text-muted-foreground sm:flex">
					<span>{APP_NAME} · JBO Labs</span>
					<a href="https://jbolabs.com" className="hover:text-foreground">jbolabs.com</a>
				</footer>
			</div>
		</HomeAuthProvider>
	);
}
