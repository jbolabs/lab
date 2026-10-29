"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Columns2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import { HintTooltip } from "@/components/hint-tooltip";
import { useMessageListVisibility } from "./message-list-visibility";
import type { MessageReadingHeaderButtonProps } from "./message-reading-header-button-types";

export function MessageReadingHeaderButton({ assistantVisible }: MessageReadingHeaderButtonProps) {
	const { t } = useLanguage();
	const router = useRouter();
	const { visible, toggle, singleColumn, backHref, backLabel } = useMessageListVisibility();
	const label = singleColumn
		? t("message.nav.backTo", { folder: backLabel })
		: assistantVisible ? null : visible ? t("message.nav.hideList") : t("message.nav.showList");

	function handleClick() {
		if (singleColumn) router.push(backHref);
		else toggle();
	}

	return (
		<>
		<Button variant="ghost" size="icon" className="shrink-0 lg:hidden pointer-coarse:size-11" aria-label={t("message.nav.backTo", { folder: backLabel })} onClick={() => router.push(backHref)}><ArrowLeft data-icon="inline-start" /></Button>
		<HintTooltip label={label} className="hidden lg:inline-flex">
			<Button variant="ghost" size="icon"
				type="button"
				className="shrink-0 pointer-coarse:size-11"
				onClick={handleClick}
				disabled={!singleColumn && assistantVisible}
				aria-label={label ?? t("message.nav.listUnavailable")}
				aria-pressed={singleColumn ? undefined : visible}
			>
				{singleColumn ? <ArrowLeft data-icon="inline-start" /> : <Columns2 data-icon="inline-start" />}
			</Button>
		</HintTooltip>
		</>
	);
}
