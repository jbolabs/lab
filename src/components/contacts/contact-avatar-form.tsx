"use client";

import { Camera, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { withCleanup } from "@/lib/async-cleanup";
import { dispatchContactAvatarChanged } from "@/lib/contacts/avatar-client";
import { normalizeEmailAddress } from "@/lib/email/address";

import { ContactAvatar } from "./contact-avatar";
import type { ContactAvatarFormProps } from "./contact-avatar-form-types";
import {
	CONTACT_AVATAR_ACCEPT,
	removeContactAvatar,
	uploadContactAvatar,
	validateContactAvatar,
} from "./contact-avatar-form-utils";

export function ContactAvatarForm({
	mailboxId,
	address,
	name,
	hasAvatar,
	onAvatarChange,
}: ContactAvatarFormProps) {
	const { t } = useLanguage();
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState<string | null>(null);

	async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0] ?? null;
		event.target.value = "";
		if (!file) {
			return;
		}
		const validationError = validateContactAvatar(file);
		if (validationError) {
			setStatus(validationError);
			return;
		}

		setBusy(true);
		setStatus(null);
		return await withCleanup(
			async () => {
				try {
					await uploadContactAvatar(mailboxId, address, file);
					onAvatarChange(true);
					dispatchContactAvatarChanged({
						email: normalizeEmailAddress(address),
						hasAvatar: true,
					});
				} catch (error) {
					setStatus(
						error instanceof Error ? error.message : t("avatar.uploadFailed")
					);
				}
			},
			() => {
				setBusy(false);
			}
		);
	}

	async function onRemove() {
		setBusy(true);
		setStatus(null);
		return await withCleanup(
			async () => {
				try {
					await removeContactAvatar(mailboxId, address);
					onAvatarChange(false);
					dispatchContactAvatarChanged({
						email: normalizeEmailAddress(address),
						hasAvatar: false,
					});
				} catch (error) {
					setStatus(
						error instanceof Error ? error.message : t("avatar.removeFailed")
					);
				}
			},
			() => {
				setBusy(false);
			}
		);
	}

	return (
		<Field data-invalid={!!status}>
			<Input
				ref={inputRef}
				type="file"
				accept={CONTACT_AVATAR_ACCEPT}
				className="hidden"
				onChange={onPick}
			/>
			<div className="flex items-center gap-3">
				<Button
					variant="plain"
					size="none"
					type="button"
					onClick={() => inputRef.current?.click()}
					disabled={busy}
					className="group disabled:cursor-wait"
					aria-label={
						hasAvatar
							? t("avatar.change", { name })
							: t("avatar.upload", { name })
					}
				>
					<span className="relative size-14 overflow-hidden rounded-full">
						<ContactAvatar
							mailboxId={mailboxId}
							address={address}
							name={name}
							hasManagedAvatar={hasAvatar}
							className="size-14"
						/>
						<span className="absolute inset-0 flex items-center justify-center bg-foreground/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
							{busy ? (
								<LoaderCircle className="size-5 animate-spin text-primary-foreground" />
							) : (
								<Camera className="size-5 text-primary-foreground" />
							)}
						</span>
					</span>
				</Button>
				<div>
					<p className="text-sm font-medium text-foreground">
						{t("avatar.title")}
					</p>
					<FieldDescription>{t("avatar.contactHint")}</FieldDescription>
					{hasAvatar && (
						<Button
							variant="link"
							size="xs"
							type="button"
							onClick={() => onRemove()}
							disabled={busy}
							className="mt-1 disabled:text-muted-foreground/70"
						>
							{t("avatar.remove")}
						</Button>
					)}
				</div>
			</div>
			{status && <FieldError>{status}</FieldError>}
		</Field>
	);
}
