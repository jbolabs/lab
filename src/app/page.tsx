import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { APP_NAME } from "@/lib/app-identity";
import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getEnv } from "@/lib/cloudflare";
import { getServerTranslator } from "@/lib/i18n/server";
import { HomeAccountMenu } from "./home-account-menu";
import { getHomeBranding } from "./home-server-utils";
import { greetingName, quickLinks } from "./utils";

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

/** Lab has one person at the door: signed out goes to sign-in, signed in gets quick links. */
export default async function HomePage() {
	const env = getEnv();
	const user = await getUserFromSession(env, (await cookies()).get(SESSION_COOKIE)?.value);
	if (!user || user.disabled) redirect("/login");

	const branding = await getHomeBranding();
	const t = await getServerTranslator();
	const iconUrl = branding.hasCustomIcon ? "/api/branding/icon" : "/icon-96.png";
	const links = quickLinks.filter((link) => !link.adminOnly || user.role === "admin");

	return (
		<div className="flex min-h-svh flex-col bg-sidebar text-foreground">
			<header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-[env(safe-area-inset-top)] sm:px-8">
				<Link href="/" className="flex h-16 items-center gap-2.5" aria-label={t("home.homeLabel", { app: branding.appName })}>
					<img src={iconUrl} height={30} width={30} alt="" className="rounded-[24%] ring-1 ring-foreground/10" />
					{branding.appName === APP_NAME ? (
						<span aria-hidden="true" className="font-display text-xl leading-none tracking-[-0.03em]">
							<span className="font-extralight">the </span>
							<span className="font-bold">lab</span>
						</span>
					) : (
						<span className="font-display text-lg font-semibold tracking-tight">{branding.appName}</span>
					)}
				</Link>
				<HomeAccountMenu user={{ id: user.id, email: user.email, name: user.name, role: user.role, hasAvatar: !!user.avatarKey }} />
			</header>

			<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10 sm:px-8 sm:pt-20">
				<h1 className="home-rise font-display text-[2.6rem] font-extralight leading-[1.05] tracking-[-0.03em] sm:text-6xl">
					<Headline text={t("home.greeting", { name: greetingName(user.name, user.email) })} />
				</h1>
				<nav aria-label={t("home.quickLinks")} className="home-rise grid grid-cols-1 gap-2 [animation-delay:80ms] sm:grid-cols-2 sm:gap-3">
					{links.map((link) => {
						const Icon = link.icon;
						return (
							<Item key={link.href} variant="outline" asChild className="min-h-16 bg-card">
								<Link href={link.href}>
									<ItemMedia variant="icon" className="size-10 rounded-md">
										<Icon />
									</ItemMedia>
									<ItemContent>
										<ItemTitle className="text-base">{t(link.labelKey)}</ItemTitle>
									</ItemContent>
									<ItemActions>
										<ChevronRight className="size-4 text-muted-foreground" />
									</ItemActions>
								</Link>
							</Item>
						);
					})}
				</nav>
			</main>
		</div>
	);
}
