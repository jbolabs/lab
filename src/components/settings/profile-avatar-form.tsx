"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, User } from "lucide-react";
import { authFetch } from "@/lib/auth/client";
import { getAvatarColorStyle } from "@/lib/avatar-colors";
import {
	dispatchProfileAvatarChanged,
	getProfileAvatarUrl,
} from "@/lib/profile/avatar-client";
import { dispatchMailboxAvatarChanged } from "@/lib/mailboxes/avatar-client";
import { useLanguage } from "@/components/language-provider";
import { Input } from "@/components/ui/input";
import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import type {
	ProfileAvatarFormProps,
	ProfileAvatarSessionResponse,
} from "./types";
import {
	getMailboxProfileAvatarUrl,
	PROFILE_AVATAR_ACCEPT,
	uploadMailboxProfileAvatar,
	uploadProfileAvatar,
	validateProfileAvatar,
} from "./profile-avatar-form-utils";
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
		mailboxId ? `/api/mailboxes/${mailboxId}/avatar` : "/api/profile/avatar",
	);
	const [status, setStatus] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (mailboxId) {
			setHasAvatar(initialHasAvatar);
			setAvatarUrl(`/api/mailboxes/${mailboxId}/avatar`);
			return;
		}
		authFetch("/api/auth/me", { redirectOnUnauthorized: false })
			.then((response) => (response.ok ? response.json() : null))
			.then((data) => {
				const authData = data as ProfileAvatarSessionResponse | null;
				setHasAvatar(!!authData?.user?.hasAvatar);
			})
			.catch(() => setHasAvatar(false));
	}, [initialHasAvatar, mailboxId]);
	async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
		const picked = event.target.files?.[0] ?? null;
		event.target.value = "";
		if (!picked) return;
		const validationError = validateProfileAvatar(picked);
		if (validationError) {
			setStatus(validationError);
			return;
		}
		setBusy(true);
		setStatus(null);
		try {
			if (mailboxId) {
				await uploadMailboxProfileAvatar(mailboxId, picked);
			} else {
				await uploadProfileAvatar(picked);
			}
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
				error instanceof Error ? error.message : t("avatar.uploadFailed"),
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
				style={getAvatarColorStyle(colorSeed ?? mailboxId ?? name)}
				aria-label={
					hasAvatar
						? t("avatar.change", { name })
						: t("avatar.upload", { name })
				}
				variant="ghost"
				className="group relative size-20 shrink-0 overflow-hidden rounded-full"
				size="icon"
			>
				{hasAvatar ? (
					<ProgressiveAvatarImage
						src={avatarUrl}
						alt={t("account.profilePicture", { name })}
						className="h-full w-full object-cover"
						onError={() => setHasAvatar(false)}
					/>
				) : (
					<span className="flex h-full w-full items-center justify-center">
						<User className="h-9 w-9" />
					</span>
				)}
				<span className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
					{busy ? (
						<LoaderCircle className="h-6 w-6 animate-spin" />
					) : (
						<span className="flex flex-col items-center gap-1 text-[11px] font-medium">
							<Camera className="h-5 w-5" />
							{hasAvatar ? t("avatar.changeShort") : t("avatar.uploadShort")}
						</span>
					)}
				</span>
			</Button>
			{status && (
				<Alert variant="destructive">
					<AlertDescription>{status}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
