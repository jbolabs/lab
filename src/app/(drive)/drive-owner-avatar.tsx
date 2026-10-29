"use client";

import { HintTooltip } from "@/components/hint-tooltip";
import { useLanguage } from "@/components/language-provider";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarColorStyle } from "@/lib/avatar-colors";
import type { DriveItemDto } from "@/lib/drive/types";

/** Owner's profile picture (or a coloured initial), with "me" or their name on hover. */
export function DriveOwnerAvatar({
	item,
}: {
	item: Pick<DriveItemDto, "ownerId" | "ownerName" | "ownerHasAvatar" | "role">;
}) {
	const { t } = useLanguage();
	const color = getAvatarColorStyle(item.ownerName || item.ownerId);
	const label = item.role === "owner" ? t("drive.me") : item.ownerName;
	return (
		<HintTooltip label={label}>
			<Avatar size="sm" aria-label={label}>
				{item.ownerHasAvatar && (
					<AvatarImage
						src={`/api/drive/owners/${encodeURIComponent(item.ownerId)}/avatar`}
						alt={label}
					/>
				)}
				<AvatarFallback>
					<span
						className="flex size-full items-center justify-center bg-(--avatar-bg) text-(--avatar-fg)"
						style={
							{
								"--avatar-bg": color.backgroundColor,
								"--avatar-fg": color.color,
							} as React.CSSProperties
						}
					>
						{(item.ownerName.trim().slice(0, 1) || "?").toUpperCase()}
					</span>
				</AvatarFallback>
			</Avatar>
		</HintTooltip>
	);
}
