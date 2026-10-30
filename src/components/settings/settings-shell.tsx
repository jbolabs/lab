"use client";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import Link from "@/components/app-link";
import { useLanguage } from "@/components/language-provider";
import { usePathname } from "@/lib/navigation";

import { SettingsNav } from "./settings-nav";

export function SettingsShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const { t } = useLanguage();
	const index = pathname === "/settings";
	return (
		<div className="flex min-h-[calc(100dvh-4rem)] flex-col md:flex-row">
			<aside
				className={
					index
						? "w-full md:w-60 md:shrink-0"
						: "hidden md:block md:w-60 md:shrink-0"
				}
			>
				<SettingsNav />
			</aside>
			<div
				className={index ? "hidden min-w-0 flex-1 md:block" : "min-w-0 flex-1"}
			>
				<div className="mx-auto w-full max-w-3xl px-5 pt-5 pb-safe-24 md:px-10 md:pt-10 [&_[data-slot=native-select-wrapper]]:max-md:w-full [&_[role=switch]]:relative [&_[role=switch]]:after:absolute [&_[role=switch]]:after:-inset-3 [&_button[type=submit]]:max-md:w-full [&_select]:max-md:text-base">
					{!index && (
						<Link
							href="/settings"
							className="mb-6 inline-flex min-h-11 items-center gap-1 text-sm text-signal md:hidden"
						>
							<ChevronLeft className="size-4" />
							{t("settings.nav.settings")}
						</Link>
					)}
					{children}
				</div>
			</div>
		</div>
	);
}
