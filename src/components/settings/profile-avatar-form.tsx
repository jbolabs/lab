"use client";
import { Camera, LoaderCircle, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch } from "@/lib/auth/client";
import { getAvatarColorStyle } from "@/lib/avatar-colors";
import { dispatchMailboxAvatarChanged } from "@/lib/mailboxes/avatar-client";
import {
	dispatchProfileAvatarChanged,
	getProfileAvatarUrl,
} from "@/lib/profile/avatar-client";

import {
	getMailboxProfileAvatarUrl,
	PROFILE_AVATAR_ACCEPT,
	uploadMailboxProfileAvatar,
	uploadProfileAvatar,
	validateProfileAvatar,
} from "./profile-avatar-form-utils";
import type {
	ProfileAvatarFormProps,
	ProfileAvatarSessionResponse,
} from "./types";

export function ProfileAvatarForm({
	mailboxId,
	initialHasAvatar = false,
	name: nameProp,
	colorSeed,
}: ProfileAvatarFormProps) {
	const { t } = useLanguage();
	const name = nameProp ?? t("avatar.profile");
	const [hasAvatar, setHasAvatar] = useState(initialHasAvatar);
	const [avatarUrl, setAvatarUrl] = useState(
		mailboxId ? `/api/mailboxes/${mailboxId}/avatar` : "/api/profile/avatar"
	);
	const [status, setStatus] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const avatarStyle = getAvatarColorStyle(colorSeed ?? mailboxId ?? name);
	const inputRef = useRef<HTMLInputElement>(null);
	const identity = `${mailboxId ?? "profile"}:${initialHasAvatar}`;
	const [previousIdentity, setPreviousIdentity] = useState(identity);
	if (identity !== previousIdentity) {
		setPreviousIdentity(identity);
		setHasAvatar(initialHasAvatar);
		setAvatarUrl(
			mailboxId ? `/api/mailboxes/${mailboxId}/avatar` : "/api/profile/avatar"
		);
	}
	useEffect(() => {
		if (mailboxId) {
			return;
		}
		authFetch("/api/auth/me", { redirectOnUnauthorized: false })
			.then((response) => (response.ok ? response.json() : null))
			.then((data) => {
				const authData = data as ProfileAvatarSessionResponse | null;
				setHasAvatar(!!authData?.user?.hasAvatar);

				return null;
			})
			.catch(() => setHasAvatar(false));
	}, [mailboxId]);
	async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
		const picked = event.target.files?.[0] ?? null;
		event.target.value = "";
		if (!picked) {
			return;
		}
		const validationError = validateProfileAvatar(picked);
		if (validationError) {
			setStatus(validationError);
			return;
		}
		setBusy(true);
		setStatus(null);
		try {
			await (mailboxId
				? uploadMailboxProfileAvatar(mailboxId, picked)
				: uploadProfileAvatar(picked));
			const nextAvatarUrl = mailboxId
				? getMailboxProfileAvatarUrl(mailboxId)
				: getProfileAvatarUrl();
			setAvatarUrl(nextAvatarUrl);
			setHasAvatar(true);
			setBusy(false);
			if (mailboxId) {
				dispatchMailboxAvatarChanged(mailboxId, nextAvatarUrl);
			} else {
				dispatchProfileAvatarChanged(nextAvatarUrl);
			}
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : t("avatar.uploadFailed")
			);
			setBusy(false);
		}
	}
	return (
		<div className="flex flex-col items-start gap-2">
			<Input
				ref={inputRef}
				type="file"
				accept={PROFILE_AVATAR_ACCEPT}
				className="hidden"
				onChange={onPick}
			/>
			<Button
				type="button"
				onClick={() => inputRef.current?.click()}
				disabled={busy}
				style={
					{
						"--avatar-background": avatarStyle.backgroundColor,
						"--avatar-foreground": avatarStyle.color,
					} as React.CSSProperties
				}
				aria-label={
					hasAvatar
						? t("avatar.change", { name })
						: t("avatar.upload", { name })
				}
				variant="ghost"
				className="group relative shrink-0 overflow-hidden"
				size="avatar"
			>
				{hasAvatar ? (
					<ProgressiveAvatarImage
						src={avatarUrl}
						alt={t("account.profilePicture", { name })}
						className="size-full object-cover"
						onError={() => setHasAvatar(false)}
					/>
				) : (
					<span className="flex size-full items-center justify-center bg-(--avatar-background) text-(--avatar-foreground)">
						<User className="size-9" />
					</span>
				)}
				<span className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
					{busy ? (
						<LoaderCircle className="size-6 animate-spin" />
					) : (
						<span className="flex flex-col items-center gap-1 text-xs font-medium">
							<Camera className="size-5" />
							{hasAvatar ? t("avatar.changeShort") : t("avatar.uploadShort")}
						</span>
					)}
				</span>
			</Button>
			{status && (
				<Alert variant="error">
					<AlertDescription>{status}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
