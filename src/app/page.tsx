import { useLoaderData } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import Link from "@/components/app-link";
import { BrandName } from "@/components/brand-name";
import { useLanguage } from "@/components/language-provider";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";
import { APP_NAME } from "@/lib/app-identity";
import type { loadHome } from "@/lib/home.server";
import { cn as scopeLayoutClasses } from "@/lib/utils";

import { HomeAccountMenu } from "./home-account-menu";
import { greetingName, quickLinks } from "./utils";

/** `*text*` in a headline is set bold against the hairline display weight, as on jbolabs.com. */
function Headline({ text }: { text: string }) {
	return text.split("*").map((segment, index) =>
		index % 2 ? (
			<strong key={index} className="font-bold tracking-tight">
				{segment}
			</strong>
		) : (
			segment
		)
	);
}

/** Lab has one person at the door: signed out goes to sign-in, signed in gets quick links. */
export default function HomePage() {
	const { user, branding } = useLoaderData({ strict: false }) as Awaited<
		ReturnType<typeof loadHome>
	>;
	const { t } = useLanguage();
	const iconUrl = branding.hasCustomIcon
		? "/api/branding/icon"
		: "/icon-96.png";
	const links = quickLinks.filter(
		(link) => !link.adminOnly || user.role === "admin"
	);

	return (
		<div className="flex min-h-svh flex-col bg-sidebar text-foreground">
			<header
				className={scopeLayoutClasses(
					"mx-auto flex w-full max-w-3xl items-center justify-between px-5 sm:px-8",
					"pt-safe"
				)}
			>
				<Link
					href="/"
					className="flex h-16 items-center gap-2.5"
					aria-label={t("home.homeLabel", { app: branding.appName })}
				>
					<img
						src={iconUrl}
						height={30}
						width={30}
						alt=""
						className="rounded-md ring-1 ring-foreground/10"
					/>
					{branding.appName === APP_NAME ? (
						<BrandName />
					) : (
						<span className="font-display text-lg font-semibold tracking-tight">
							{branding.appName}
						</span>
					)}
				</Link>
				<HomeAccountMenu
					user={{
						email: user.email,
						hasAvatar: !!user.avatarKey,
						id: user.id,
						name: user.name,
						role: user.role,
					}}
				/>
			</header>

			<main
				className={scopeLayoutClasses(
					"mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-5 pt-10 sm:px-8 sm:pt-20",
					"pb-safe-6"
				)}
			>
				<h1 className="home-rise font-display text-4xl leading-none font-extralight tracking-tight sm:text-6xl">
					<Headline
						text={t("home.greeting", {
							name: greetingName(user.name, user.email),
						})}
					/>
				</h1>
				<nav
					aria-label={t("home.quickLinks")}
					className="home-rise grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3"
				>
					{links.map((link) => {
						const Icon = link.icon;
						return (
							<Item
								key={link.href}
								variant="outline"
								className=" "
								render={<Link href={link.href} />}
							>
								<ItemMedia variant="icon" className=" ">
									<Icon />
								</ItemMedia>
								<ItemContent>
									<ItemTitle className="">{t(link.labelKey)}</ItemTitle>
								</ItemContent>
								<ItemActions>
									<ChevronRight className="size-4 text-muted-foreground" />
								</ItemActions>
							</Item>
						);
					})}
				</nav>
			</main>
		</div>
	);
}
