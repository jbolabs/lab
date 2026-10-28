"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { useHomeAuth } from "./home-auth";

/** Primary actions; on phones they sit full width at the bottom, in the thumb's reach. */
export function HomeHeroActions() {
	const { t } = useLanguage();
	const hasUser = !!useHomeAuth();

	return (
		<div className="home-rise flex flex-col gap-2 [animation-delay:160ms] sm:flex-row sm:gap-3">
			<Button
				size="lg"
				asChild
				className="h-12 px-7 text-base sm:h-11 sm:text-sm"
			>
				<Link href={hasUser ? "/inbox" : "/login"}>
					{hasUser ? t("home.viewInbox") : t("home.logIn")}
					<ArrowRight data-icon="inline-end" />
				</Link>
			</Button>
			{!hasUser && (
				<Button
					size="lg"
					variant="ghost"
					asChild
					className="h-12 px-7 text-base text-muted-foreground sm:h-11 sm:text-sm"
				>
					<Link href="/setup">{t("home.createAccount")}</Link>
				</Button>
			)}
		</div>
	);
}
