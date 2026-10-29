"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarColorStyle } from "@/lib/avatar-colors";
import { CONTACT_AVATAR_CHANGED_EVENT } from "@/lib/contacts/avatar-client";
import { normalizeEmailAddress } from "@/lib/email/address";
import { cn } from "@/lib/utils";

import type { ContactAvatarProps } from "./contact-avatar-types";
import {
	getContactAvatarInitial,
	getManagedContactAvatarUrl,
} from "./contact-avatar-utils";

function ContactAvatarContent({
	mailboxId,
	address,
	name,
	hasManagedAvatar = false,
	managedAvatarUrl,
	className,
}: ContactAvatarProps) {
	const [managedAvatar, setManagedAvatar] = useState(hasManagedAvatar);
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	const [avatarVersion, setAvatarVersion] = useState(0);

	useEffect(() => {
		function onAvatarChanged(event: Event) {
			const { detail } = event as CustomEvent<{
				email?: string;
				hasAvatar?: boolean;
			}>;
			if (detail?.email === normalizeEmailAddress(address)) {
				setManagedAvatar(!!detail.hasAvatar);
				setAvatarVersion(Date.now());
			}
		}

		window.addEventListener(CONTACT_AVATAR_CHANGED_EVENT, onAvatarChanged);
		return () =>
			window.removeEventListener(CONTACT_AVATAR_CHANGED_EVENT, onAvatarChanged);
	}, [address]);

	const avatarUrl =
		managedAvatarUrl ||
		(managedAvatar && mailboxId
			? getManagedContactAvatarUrl(mailboxId, address, avatarVersion)
			: null);
	const imageFailed = avatarUrl === failedUrl;

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
				{avatarUrl && !imageFailed && (
					<ProgressiveAvatarImage
						src={avatarUrl}
						alt=""
						className="absolute inset-0 h-full w-full object-cover"
						onError={() => {
							if (managedAvatarUrl) {
								setFailedUrl(avatarUrl);
							} else if (managedAvatar) {
								setManagedAvatar(false);
							} else {
								setFailedUrl(avatarUrl);
							}
						}}
					/>
				)}
			</Avatar>
		</span>
	);
}

export function ContactAvatar(props: ContactAvatarProps) {
	return (
		<ContactAvatarContent
			key={JSON.stringify([
				props.address,
				props.hasManagedAvatar,
				props.mailboxId,
				props.managedAvatarUrl,
			])}
			{...props}
		/>
	);
}
