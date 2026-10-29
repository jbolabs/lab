"use client";

import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import type { MailboxOption } from "@/components/mailbox-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldContent,
	FieldLabel,
	FieldDescription,
	FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { withCleanup } from "@/lib/async-cleanup";

import { Switch } from "../ui/switch";
import type { MailboxAutoReplySettings } from "./types";
import { updateMailboxAutoReply } from "./utils";

const defaultSettings: MailboxAutoReplySettings = {
	body: "",
	enabled: false,
	subject: "Out of office",
};
function getAutoReplySettings(mailbox: MailboxOption | null) {
	return {
		body: mailbox?.autoReplyBody ?? "",
		enabled: mailbox?.autoReplyEnabled ?? false,
		subject: mailbox?.autoReplySubject ?? "Out of office",
	};
}
export function MailboxAutoReplyForm() {
	const { t } = useLanguage();
	const { selectedMailbox, setSelectedMailbox, isLoading } =
		useSelectedMailbox();
	const [settings, setSettings] = useState(defaultSettings);
	const [savedSettings, setSavedSettings] = useState(defaultSettings);
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const nextSettings = getAutoReplySettings(selectedMailbox);
	const resetKey = JSON.stringify([selectedMailbox?.id, nextSettings]);
	const [previousResetKey, setPreviousResetKey] = useState<string | null>(null);
	if (previousResetKey !== resetKey) {
		setPreviousResetKey(resetKey);

		setSettings(nextSettings);
		setSavedSettings(nextSettings);
		setStatus(null);
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox) {
			return;
		}
		if (settings.enabled && !settings.body.trim()) {
			setStatus(t("settings.autoReply.needMessage"));
			return;
		}
		setSaving(true);
		setStatus(null);
		return await withCleanup(
			async () => {
				try {
					const saved = await updateMailboxAutoReply(
						selectedMailbox.id,
						settings
					);
					setSettings(saved);
					setSavedSettings(saved);
					setSelectedMailbox({
						...selectedMailbox,
						autoReplyBody: saved.body,
						autoReplyEnabled: saved.enabled,
						autoReplySubject: saved.subject,
					});
					setStatus(t("common.saved"));
				} catch (error) {
					setStatus(
						error instanceof Error
							? error.message
							: t("settings.autoReply.failed")
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
				{t("settings.autoReply.selectInbox")}
			</p>
		);
	}
	const address = `${selectedMailbox.localPart}@${selectedMailbox.hostname}`;
	const canManage = selectedMailbox.permission === "full_access";
	const changed = JSON.stringify(settings) !== JSON.stringify(savedSettings);
	return (
		<form onSubmit={onSubmit} className="flex flex-col gap-4">
			<FieldGroup>
				<Field orientation="horizontal">
					<FieldContent>
						<FieldLabel htmlFor="mailbox-auto-reply-form-0">
							{t("settings.autoReply.enableFor", { address })}
						</FieldLabel>
						<FieldDescription>{t("settings.autoReply.limit")}</FieldDescription>
					</FieldContent>

					<Switch
						id="mailbox-auto-reply-form-0"
						checked={settings.enabled}
						onCheckedChange={(enabled) => setSettings({ ...settings, enabled })}
						disabled={!canManage || saving}
						aria-label={t("settings.autoReply.enableFor", { address })}
					/>
				</Field>
				{settings.enabled && (
					<>
						<Field>
							<FieldLabel htmlFor="autoReplySubject">
								{t("settings.autoReply.subject")}
							</FieldLabel>
							<Input
								id="autoReplySubject"
								value={settings.subject}
								onChange={(event) =>
									setSettings({ ...settings, subject: event.target.value })
								}
								placeholder={t("settings.autoReply.subjectPlaceholder")}
								disabled={!canManage || saving}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="autoReplyBody">
								{t("settings.autoReply.message")}
							</FieldLabel>
							<Textarea
								id="autoReplyBody"
								value={settings.body}
								onChange={(event) =>
									setSettings({ ...settings, body: event.target.value })
								}
								placeholder={t("settings.autoReply.messagePlaceholder")}
								rows={7}
								disabled={!canManage || saving}
							/>
						</Field>
						<div className="flex items-center gap-3">
							<Button type="submit" disabled={!canManage || saving || !changed}>
								{saving ? t("common.saving") : t("settings.autoReply.save")}
							</Button>
							{!canManage && (
								<p className="text-sm text-muted-foreground">
									{t("settings.autoReply.needFullAccess")}
								</p>
							)}
							{status && (
								<output className="text-sm text-muted-foreground">
									{status}
								</output>
							)}
						</div>
					</>
				)}
			</FieldGroup>
		</form>
	);
}
