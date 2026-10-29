"use client";

import { useState } from "react";

import { isHtmlSignature } from "@/components/compose/rich-text-utils";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { EmailHtmlRenderer } from "@/components/messages/email-html-renderer";
import { Button } from "@/components/ui/button";
import {
	FieldLabel,
	Field,
	FieldGroup,
	FieldDescription,
	FieldTitle,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { withCleanup } from "@/lib/async-cleanup";

import { updateMailboxSignature } from "./utils";

export function MailboxSignatureForm() {
	const { t } = useLanguage();
	const { selectedMailbox, setSelectedMailbox, isLoading } =
		useSelectedMailbox();
	const [signature, setSignature] = useState("");
	const [savedSignature, setSavedSignature] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const resetKey = JSON.stringify([
		selectedMailbox?.id,
		selectedMailbox?.signature,
	]);
	const [previousResetKey, setPreviousResetKey] = useState<string | null>(null);
	if (previousResetKey !== resetKey) {
		setPreviousResetKey(resetKey);
		const nextSignature = selectedMailbox?.signature ?? "";
		setSignature(nextSignature);
		setSavedSignature(nextSignature);
		setStatus(null);
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox) {
			return;
		}
		setSaving(true);
		setStatus(null);
		return await withCleanup(
			async () => {
				try {
					const saved = await updateMailboxSignature(
						selectedMailbox.id,
						signature
					);
					setSignature(saved);
					setSavedSignature(saved);
					setSelectedMailbox({ ...selectedMailbox, signature: saved });
					setStatus(t("common.saved"));
				} catch (error) {
					setStatus(
						error instanceof Error
							? error.message
							: t("settings.signature.failed")
					);
				}
			},
			() => {
				setSaving(false);
			}
		);
	}
	if (isLoading) {
		return (
			<p className="text-sm text-muted-foreground">
				{t("settings.signature.loadingInbox")}
			</p>
		);
	}
	if (!selectedMailbox) {
		return (
			<p className="text-sm text-muted-foreground">
				{t("settings.signature.selectInbox")}
			</p>
		);
	}
	const address = `${selectedMailbox.localPart}@${selectedMailbox.hostname}`;
	const canManage = selectedMailbox.permission === "full_access";
	return (
		<form onSubmit={onSubmit} className="flex flex-col gap-4">
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="mailboxSignature">
						{t("settings.signature.for", { address })}
					</FieldLabel>
					<Textarea
						id="mailboxSignature"
						value={signature}
						onChange={(event) => setSignature(event.target.value)}
						placeholder={t("settings.signature.placeholder")}
						rows={6}
						disabled={!canManage || saving}
					/>
					<FieldDescription>{t("settings.signature.hint")}</FieldDescription>
				</Field>
				{isHtmlSignature(signature) && (
					<div className="flex flex-col gap-2">
						<FieldTitle>{t("settings.signature.preview")}</FieldTitle>
						<EmailHtmlRenderer
							className="rounded-lg border p-4 text-sm text-foreground"
							html={signature}
						/>
					</div>
				)}
				<div className="flex items-center gap-3">
					<Button
						type="submit"
						disabled={
							!canManage || saving || signature.trim() === savedSignature
						}
					>
						{saving ? t("common.saving") : t("settings.signature.save")}
					</Button>
					{!canManage && (
						<p className="text-sm text-muted-foreground">
							{t("settings.signature.needFullAccess")}
						</p>
					)}
					{status && (
						<output className="text-sm text-muted-foreground">{status}</output>
					)}
				</div>
			</FieldGroup>
		</form>
	);
}
