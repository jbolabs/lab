"use client";
import { FieldLabel, Field, FieldGroup } from "@/components/ui/field";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ForwardingEmailFormProps } from "./types";
import { updateForwardingEmail } from "./utils";
export function ForwardingEmailForm({
	initialForwardingEmail,
}: ForwardingEmailFormProps) {
	const { t } = useLanguage();
	const [forwardingEmail, setForwardingEmail] = useState(
		initialForwardingEmail,
	);
	const [savedForwardingEmail, setSavedForwardingEmail] = useState(
		initialForwardingEmail,
	);
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setStatus(null);
		try {
			const saved = await updateForwardingEmail(forwardingEmail);
			setForwardingEmail(saved);
			setSavedForwardingEmail(saved);
			setStatus(t("common.saved"));
		} catch (error) {
			setStatus(
				error instanceof Error
					? error.message
					: t("settings.forwarding.failed"),
			);
		} finally {
			setSaving(false);
		}
	}
	return (
		<form onSubmit={onSubmit} className="flex flex-col gap-4">
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="forwardingEmail">
						{t("settings.forwarding.destination")}
					</FieldLabel>
					<Input
						id="forwardingEmail"
						value={forwardingEmail}
						onChange={(event) => setForwardingEmail(event.target.value)}
						type="email"
						autoComplete="email"
						placeholder="destination@example.com"
					/>
					<p className="text-xs leading-5 text-muted-foreground">
						{t("settings.forwarding.hint")}
					</p>
				</Field>
				<div className="flex items-center gap-3">
					<Button
						type="submit"
						disabled={saving || forwardingEmail.trim() === savedForwardingEmail}
					>
						{saving ? t("common.saving") : t("settings.forwarding.save")}
					</Button>
					{status && (
						<p role="status" className="text-sm text-muted-foreground">
							{status}
						</p>
					)}
				</div>
			</FieldGroup>
		</form>
	);
}
