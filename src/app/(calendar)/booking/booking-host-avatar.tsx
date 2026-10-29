"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useLanguage } from "@/components/language-provider";
import { getAvatarColorStyle } from "@/lib/avatar-colors";
import type { BookingHostAvatarProps } from "./types";

export function BookingHostAvatar({ host, currentUserId, size = "medium" }: BookingHostAvatarProps) {
	const { t } = useLanguage();
	const imageUrl = host.id === currentUserId ? "/api/profile/avatar" : `/api/accounts/${host.id}/avatar`;
	const sizeClass = size === "small" ? "size-5 text-[10px]" : "size-8 text-sm";
	return <Avatar className={sizeClass}>
		{host.hasAvatar && <AvatarImage src={imageUrl} alt={t("account.profilePicture", { name: host.name || host.email })} />}
		<AvatarFallback style={getAvatarColorStyle(host.email)}>{(host.name || host.email).slice(0, 1).toUpperCase()}</AvatarFallback>
	</Avatar>;
}
