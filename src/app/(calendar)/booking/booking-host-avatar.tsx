"use client";

import { useLanguage } from "@/components/language-provider";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarColorStyle } from "@/lib/avatar-colors";

import type { BookingHostAvatarProps } from "./types";

export function BookingHostAvatar({
	host,
	currentUserId,
	size = "medium",
}: BookingHostAvatarProps) {
	const { t } = useLanguage();
	const color = getAvatarColorStyle(host.email);
	const imageUrl =
		host.id === currentUserId
			? "/api/profile/avatar"
			: `/api/accounts/${host.id}/avatar`;
	const sizeClass = size === "small" ? "size-5" : "size-8";
	return (
		<Avatar className={sizeClass}>
			{host.hasAvatar && (
				<AvatarImage
					src={imageUrl}
					alt={t("account.profilePicture", { name: host.name || host.email })}
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
					{(host.name || host.email).slice(0, 1).toUpperCase()}
				</span>
			</AvatarFallback>
		</Avatar>
	);
}
