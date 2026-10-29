"use client";

import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { FieldLabel, Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { withCleanup } from "@/lib/async-cleanup";

import { updatePassword } from "./utils";

export function ChangePasswordForm() {
	const { t } = useLanguage();
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus(null);
		if (newPassword !== confirmPassword) {
			setStatus(t("settings.password.mismatch"));
			return;
		}
		setLoading(true);
		return await withCleanup(
			async () => {
				try {
					await updatePassword(currentPassword, newPassword);
					setCurrentPassword("");
					setNewPassword("");
					setConfirmPassword("");
					setStatus(t("settings.password.changed"));
				} catch (error) {
					setStatus(
						error instanceof Error
							? error.message
							: t("settings.password.failed")
					);
				}
			},
			() => {
				setLoading(false);
			}
		);
	}
	return (
		<form onSubmit={onSubmit}>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="currentPassword">
						{t("settings.password.current")}
					</FieldLabel>
					<Input
						id="currentPassword"
						type="password"
						autoComplete="current-password"
						value={currentPassword}
						onChange={(event) => setCurrentPassword(event.target.value)}
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="newPassword">
						{t("settings.password.new")}
					</FieldLabel>
					<Input
						id="newPassword"
						type="password"
						autoComplete="new-password"
						value={newPassword}
						onChange={(event) => setNewPassword(event.target.value)}
						minLength={8}
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="confirmPassword">
						{t("settings.password.confirm")}
					</FieldLabel>
					<Input
						id="confirmPassword"
						type="password"
						autoComplete="new-password"
						value={confirmPassword}
						onChange={(event) => setConfirmPassword(event.target.value)}
						minLength={8}
						required
					/>
				</Field>
				<div className="flex items-center gap-3">
					<Button type="submit" disabled={loading}>
						{loading
							? t("settings.password.changing")
							: t("settings.password.change")}
					</Button>
					{status && (
						<output className="text-sm text-muted-foreground">{status}</output>
					)}
				</div>
			</FieldGroup>
		</form>
	);
}
