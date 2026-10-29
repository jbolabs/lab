"use client";

import { TextAlignJustify } from "lucide-react";
import Link from "next/link";

import { HintTooltip } from "@/components/hint-tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { BrandMark, Wordmark } from "./brand";
import { useLanguage } from "./language-provider";
import { useSidebar } from "./sidebar-state";
import type { SidebarHeaderProps } from "./sidebar-state-types";

export function SidebarHeader({ href, app }: SidebarHeaderProps) {
	const { t } = useLanguage();
	const { minimal, toggle } = useSidebar();
	const toggleButton = (
		<Button
			type="button"
			variant="ghost"
			size="icon-lg"
			onClick={toggle}
			className="shrink-0"
			aria-label={
				minimal ? t("navigation.expandMenu") : t("navigation.collapseMenu")
			}
		>
			{minimal ? <BrandMark size={32} /> : <TextAlignJustify />}
		</Button>
	);
	return (
		<div className={cn("mb-1 flex h-11 items-center", !minimal && "gap-1")}>
			{minimal ? (
				<HintTooltip label={t("navigation.expandMenu")} side="right">
					{toggleButton}
				</HintTooltip>
			) : (
				toggleButton
			)}
			{!minimal && (
				<Link href={href} className="flex min-w-0 items-center gap-2.5">
					<Wordmark app={app} />
				</Link>
			)}
		</div>
	);
}
