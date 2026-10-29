"use client";

import { useEffect, useState } from "react";

import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import { CONTACT_AVATAR_CHANGED_EVENT } from "@/lib/contacts/avatar-client";
import { getBrandLogoUrl } from "@/lib/contacts/brand-logo-utils";
import { normalizeEmailAddress } from "@/lib/email/address";

import type { ContactAvatarProps } from "./contact-avatar-types";
import { getManagedContactAvatarUrl } from "./contact-avatar-utils";

const IMAGE_CLASS = "absolute inset-0 size-full rounded-full object-cover";

/**
 * The sender's picture, in Gmail's order: the contact's own avatar (uploaded or
 * Gravatar), then their organisation's BIMI logo or icon, then nothing so the
 * initial underneath shows.
 */
export function ContactAvatarImage({
	mailboxId,
	address,
	hasManagedAvatar = false,
	managedAvatarUrl,
}: Omit<ContactAvatarProps, "name" | "className">) {
	const [managedAvatar, setManagedAvatar] = useState(hasManagedAvatar);
	const [avatarVersion, setAvatarVersion] = useState(0);
	const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

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

	const ownUrl =
		managedAvatarUrl ||
		(managedAvatar && mailboxId
			? getManagedContactAvatarUrl(mailboxId, address, avatarVersion)
			: null);
	// Our own mailboxes have their own avatar; a company logo would stand in for the user.
	const brandUrl = managedAvatarUrl ? null : getBrandLogoUrl(address);
	const src = [ownUrl, brandUrl].find((url) => url && !failed.has(url));
	if (!src) {
		return null;
	}

	const onError = () => setFailed((current) => new Set(current).add(src));
	if (src === brandUrl) {
		return (
			// oxlint-disable-next-line next/no-img-element -- An authenticated API image; no Next image optimizer is available.
			<img
				key={src}
				src={src}
				alt=""
				loading="lazy"
				decoding="async"
				className={IMAGE_CLASS}
				onError={onError}
			/>
		);
	}
	return (
		<ProgressiveAvatarImage
			key={src}
			src={src}
			alt=""
			className={IMAGE_CLASS}
			onError={onError}
		/>
	);
}
