"use client";

import { useEffect, useState } from "react";

import type { ContactAvatarProps } from "@/components/contacts/contact-avatar-types";
import {
	getContactAvatarInitial,
	getManagedContactAvatarUrl,
} from "@/components/contacts/contact-avatar-utils";
import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CONTACT_AVATAR_CHANGED_EVENT } from "@/lib/contacts/avatar-client";
import { normalizeEmailAddress } from "@/lib/email/address";

function MessageAvatarContent({
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

	return (
		<Avatar
			className={className}

			aria-hidden
		>
			<AvatarFallback>{getContactAvatarInitial(name, address)}</AvatarFallback>
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
	);
}

export function MessageAvatar(props: ContactAvatarProps) {
	return (
		<MessageAvatarContent
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
