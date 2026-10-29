"use client";

import type { CSSProperties } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarColorStyle } from "@/lib/avatar-colors";
import { normalizeEmailAddress } from "@/lib/email/address";
import { cn } from "@/lib/utils";

import { ContactAvatarImage } from "./contact-avatar-image";
import type { ContactAvatarProps } from "./contact-avatar-types";
import { getContactAvatarInitial } from "./contact-avatar-utils";

export function ContactAvatar({
	mailboxId,
	address,
	name,
	hasManagedAvatar = false,
	managedAvatarUrl,
	className,
}: ContactAvatarProps) {
	const colors = getAvatarColorStyle(normalizeEmailAddress(address) || name);
	return (
		<span
			className="contents"
			style={
				{
					"--avatar-background": colors.backgroundColor,
					"--avatar-foreground": colors.color,
				} as CSSProperties
			}
		>
			<Avatar
				className={cn(
					"relative flex size-9 shrink-0 items-center justify-center overflow-hidden",
					className
				)}

				aria-hidden
			>
				<AvatarFallback asChild>
					<span className="bg-(--avatar-background) text-(--avatar-foreground)">
						{getContactAvatarInitial(name, address)}
					</span>
				</AvatarFallback>
				<ContactAvatarImage
					key={JSON.stringify([
						address,
						hasManagedAvatar,
						mailboxId,
						managedAvatarUrl,
					])}
					mailboxId={mailboxId}
					address={address}
					hasManagedAvatar={hasManagedAvatar}
					managedAvatarUrl={managedAvatarUrl}
				/>
			</Avatar>
		</span>
	);
}
