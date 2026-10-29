"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, LoaderCircle, User } from "lucide-react";
import { useRef, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runAsyncAction } from "@/lib/async-cleanup";
import { dispatchMailboxAvatarChanged } from "@/lib/mailboxes/avatar-client";

import {
	getMailboxAvatarUrl,
	MAILBOX_AVATAR_ACCEPT,
	uploadMailboxAvatar,
	validateMailboxAvatar,
} from "./avatar-utils";
import type { MailboxAvatarFormProps } from "./types";

function MailboxAvatarFormContent({
	mailboxId,
	hasAvatar: initialHasAvatar,
	name,
}: MailboxAvatarFormProps) {
	const { t } = useLanguage();
	const queryClient = useQueryClient();
	const [hasAvatar, setHasAvatar] = useState(initialHasAvatar);
	const [avatarUrl, setAvatarUrl] = useState(
		`/api/mailboxes/${mailboxId}/avatar`
	);
	const [status, setStatus] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	function onPick(event: React.ChangeEvent<HTMLInputElement>) {
		const picked = event.target.files?.[0] ?? null;
		event.target.value = "";
		if (!picked) {
			return;
		}

		const validationError = validateMailboxAvatar(picked);
		if (validationError) {
			setStatus(validationError);
			return;
		}

		setBusy(true);
		setStatus(null);
		return runAsyncAction(
			async () => {
				await uploadMailboxAvatar(mailboxId, picked);
				const nextAvatarUrl = getMailboxAvatarUrl(mailboxId);
				setAvatarUrl(nextAvatarUrl);
				setHasAvatar(true);
				dispatchMailboxAvatarChanged(mailboxId, nextAvatarUrl);
				await queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
			},
			(failure) => {
				setStatus(
					failure instanceof Error ? failure.message : t("avatar.uploadFailed")
				);
			},
			() => {
				setBusy(false);
			}
		);
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<Input
				ref={inputRef}
				type="file"
				accept={MAILBOX_AVATAR_ACCEPT}
				className="hidden"
				onChange={onPick}
			/>
			<div className="flex items-center gap-4">
				<span className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-primary text-primary-foreground">
					{hasAvatar ? (
						<ProgressiveAvatarImage
							src={avatarUrl}
							alt={t("account.profilePicture", { name })}
							className="size-full object-cover"
							onError={() => setHasAvatar(false)}
						/>
					) : (
						<User className="size-9" />
					)}
				</span>
				<Button
					type="button"
					variant="outline"
					onClick={() => inputRef.current?.click()}
					disabled={busy}
					aria-label={
						hasAvatar
							? t("avatar.change", { name })
							: t("avatar.upload", { name })
					}
				>
					{busy ? (
						<LoaderCircle data-icon="inline-start" className="animate-spin" />
					) : (
						<Camera data-icon="inline-start" />
					)}
					{hasAvatar ? t("avatar.changeShort") : t("avatar.uploadShort")}
				</Button>
			</div>
			{status && (
				<p role="alert" className="max-w-xs text-xs text-destructive">
					{status}
				</p>
			)}
		</div>
	);
}

export default function MailboxAvatarForm(props: MailboxAvatarFormProps) {
	return (
		<MailboxAvatarFormContent
			key={JSON.stringify([props.mailboxId, props.hasAvatar])}
			{...props}
		/>
	);
}
