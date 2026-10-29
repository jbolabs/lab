"use client";

import { ArrowLeft, Columns2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

import { useMessageListVisibility } from "./message-list-visibility";
import type { MessageReadingHeaderButtonProps } from "./message-reading-header-button-types";

export function MessageReadingHeaderButton({
	assistantVisible,
}: MessageReadingHeaderButtonProps) {
	const { t } = useLanguage();
	const router = useRouter();
	const { visible, toggle, singleColumn, backHref, backLabel } =
		useMessageListVisibility();
	let label: string | null = null;
	if (singleColumn) {
		label = t("message.nav.backTo", { folder: backLabel });
	} else if (!assistantVisible) {
		label = visible ? t("message.nav.hideList") : t("message.nav.showList");
	}

	function handleClick() {
		if (singleColumn) {
			router.push(backHref);
		} else {
			toggle();
		}
	}

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className="shrink-0 lg:hidden"
				data-edge-swipe-back
				aria-label={t("message.nav.backTo", { folder: backLabel })}
				onClick={() => router.push(backHref)}
			>
				<ArrowLeft data-icon="inline-start" />
			</Button>
			<HintTooltip label={label} className="hidden lg:inline-flex">
				<Button
					variant="ghost"
					size="icon"
					type="button"
					className="shrink-0"
					onClick={handleClick}
					disabled={!singleColumn && assistantVisible}
					aria-label={label ?? t("message.nav.listUnavailable")}
					aria-pressed={singleColumn ? undefined : visible}
				>
					{singleColumn ? (
						<ArrowLeft data-icon="inline-start" />
					) : (
						<Columns2 data-icon="inline-start" />
					)}
				</Button>
			</HintTooltip>
		</>
	);
}
