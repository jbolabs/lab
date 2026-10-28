"use client";

import { useRef, useState } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { dispatchContactAvatarChanged } from "@/lib/contacts/avatar-client";
import { normalizeEmailAddress } from "@/lib/email/address";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/language-provider";
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
		if (!file) return;
		const validationError = validateContactAvatar(file);
		if (validationError) {
			setStatus(validationError);
			return;
		}

		setBusy(true);
		setStatus(null);
		try {
			await uploadContactAvatar(mailboxId, address, file);
			onAvatarChange(true);
			dispatchContactAvatarChanged({
				email: normalizeEmailAddress(address),
				hasAvatar: true,
			});
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : t("avatar.uploadFailed"),
			);
		} finally {
			setBusy(false);
		}
	}

	async function onRemove() {
		setBusy(true);
		setStatus(null);
		try {
			await removeContactAvatar(mailboxId, address);
			onAvatarChange(false);
			dispatchContactAvatarChanged({
				email: normalizeEmailAddress(address),
				hasAvatar: false,
			});
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : t("avatar.removeFailed"),
			);
		} finally {
			setBusy(false);
		}
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
					variant="ghost"
					type="button"
					onClick={() => inputRef.current?.click()}
					disabled={busy}
					className="group relative size-14 overflow-hidden rounded-full outline-none ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait"
					aria-label={
						hasAvatar
							? t("avatar.change", { name })
							: t("avatar.upload", { name })
					}
				>
					<ContactAvatar
						mailboxId={mailboxId}
						address={address}
						name={name}
						hasManagedAvatar={hasAvatar}
						className="size-14 text-lg"
					/>
					<span className="absolute inset-0 flex items-center justify-center bg-foreground/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
						{busy ? (
							<LoaderCircle className="h-5 w-5 animate-spin text-primary-foreground" />
						) : (
							<Camera className="h-5 w-5 text-primary-foreground" />
						)}
					</span>
				</Button>
				<div>
					<p className="text-sm font-medium text-foreground">
						{t("avatar.title")}
					</p>
					<FieldDescription>{t("avatar.contactHint")}</FieldDescription>
					{hasAvatar && (
						<Button
							variant="ghost"
							type="button"
							onClick={() => void onRemove()}
							disabled={busy}
							className="mt-1 text-xs font-medium text-signal hover:underline disabled:text-muted-foreground/70"
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
