"use client";

import Link from "next/link";
import { Menu, TextAlignJustify } from "lucide-react";
import { BrandMark, Wordmark } from "./brand";
import { useSidebar } from "./sidebar-state";
import type { SidebarHeaderProps } from "./sidebar-state-types";
import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "./language-provider";

export function SidebarHeader({ href, label }: SidebarHeaderProps) {
	const { t } = useLanguage();
	const { minimal, toggle } = useSidebar();
	const toggleButton = <button type="button" onClick={toggle} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent" aria-label={minimal ? t("navigation.expandMenu") : t("navigation.collapseMenu")}>
		{minimal ? <BrandMark size={32} /> : <TextAlignJustify size={18} />}
	</button>;
	return (
		<div className={`mb-3 flex h-10 items-center ${minimal ? "" : "gap-2 px-1"}`}>
			{minimal ? <HintTooltip label={t("navigation.expandMenu")} side="right">{toggleButton}</HintTooltip> : toggleButton}
			{!minimal && <Link href={href} className="flex min-w-0 items-center gap-2.5"><BrandMark size={30} /><Wordmark name={label} /></Link>}
		</div>
	);
}
