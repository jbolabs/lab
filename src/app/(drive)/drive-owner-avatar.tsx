"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useLanguage } from "@/components/language-provider";
import { HintTooltip } from "@/components/hint-tooltip";
import { getAvatarColorStyle } from "@/lib/avatar-colors";
import type { DriveItemDto } from "@/lib/drive/types";

/** Owner's profile picture (or a coloured initial), with "me" or their name on hover. */
export function DriveOwnerAvatar({ item }: { item: Pick<DriveItemDto, "ownerId" | "ownerName" | "ownerHasAvatar" | "role"> }) {
	const { t } = useLanguage();
	const label = item.role === "owner" ? t("drive.me") : item.ownerName;
	const className = "size-6 shrink-0 rounded-full";
	return <HintTooltip label={label}><Avatar className="size-7" aria-label={label}>
		{item.ownerHasAvatar && <AvatarImage src={`/api/drive/owners/${encodeURIComponent(item.ownerId)}/avatar`} alt={label} />}
		<AvatarFallback style={getAvatarColorStyle(item.ownerName || item.ownerId)}>{(item.ownerName.trim().slice(0, 1) || "?").toUpperCase()}</AvatarFallback>
	</Avatar></HintTooltip>;
}
