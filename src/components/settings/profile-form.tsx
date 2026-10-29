"use client";

import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import {
	FieldLabel,
	Field,
	FieldGroup,
	FieldContent,
	FieldTitle,
	FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { withCleanup, requireSuccessfulResponse } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import { dispatchProfileNameChanged } from "@/lib/profile/name-client";

import { ProfileAvatarForm } from "./profile-avatar-form";
import type { ProfileFormProps, ProfileFormResponse } from "./types";

export function ProfileForm({
	initialName,
	initialResetEmail,
	email,
}: ProfileFormProps) {
	const { t } = useLanguage();
	const [name, setName] = useState(initialName);
	const [resetEmail, setResetEmail] = useState(initialResetEmail);
	const [savedName, setSavedName] = useState(initialName);
	const [savedResetEmail, setSavedResetEmail] = useState(initialResetEmail);
	const [profileStatus, setProfileStatus] = useState<string | null>(null);
	const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);
	const [savingProfile, setSavingProfile] = useState(false);
	const [savingRecovery, setSavingRecovery] = useState(false);
	async function saveProfile(nextName: string, nextResetEmail: string) {
		try {
			const res = await authFetch("/api/settings/profile", {
				body: JSON.stringify({ name: nextName, resetEmail: nextResetEmail }),
				headers: { "Content-Type": "application/json" },
				method: "PATCH",
			});
			const data = (await res.json()) as ProfileFormResponse;
			requireSuccessfulResponse(
				res,
				typeof data.error === "string"
					? data.error
					: t("settings.profile.updateFailed")
			);
			const nextSavedName = data.user?.name ?? nextName.trim();
			const nextSavedResetEmail = data.user?.resetEmail ?? "";
			setName(nextSavedName);
			setResetEmail(nextSavedResetEmail);
			setSavedName(nextSavedName);
			setSavedResetEmail(nextSavedResetEmail);
			dispatchProfileNameChanged(nextSavedName);
		} catch (error) {
			throw error instanceof Error
				? error
				: new Error(t("settings.profile.updateFailed"));
		}
	}
	async function onProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSavingProfile(true);
		setProfileStatus(null);
		return await withCleanup(
			async () => {
				try {
					await saveProfile(name, savedResetEmail);
					setProfileStatus(t("common.saved"));
				} catch (error) {
					setProfileStatus(
						error instanceof Error
							? error.message
							: t("settings.profile.updateFailed")
					);
				}
			},
			() => {
				setSavingProfile(false);
			}
		);
	}
	async function onRecoverySubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSavingRecovery(true);
		setRecoveryStatus(null);
		return await withCleanup(
			async () => {
				try {
					await saveProfile(savedName, resetEmail);
					setRecoveryStatus(t("common.saved"));
				} catch (error) {
					setRecoveryStatus(
						error instanceof Error
							? error.message
							: t("settings.profile.recoveryFailed")
					);
				}
			},
			() => {
				setSavingRecovery(false);
			}
		);
	}
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>{t("settings.account.detailsTitle")}</CardTitle>
					<CardDescription>
						{t("settings.account.detailsDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onProfileSubmit} className="flex flex-col gap-6">
						<FieldGroup>
							<div className="flex items-center gap-4">
								<ProfileAvatarForm name={name} colorSeed={email} />
								<FieldContent>
									<FieldTitle>{t("settings.profile.pictureTitle")}</FieldTitle>
									<FieldDescription>
										{t("settings.profile.pictureDescription")}
									</FieldDescription>
								</FieldContent>
							</div>

							<Field>
								<FieldLabel htmlFor="name">{t("common.name")}</FieldLabel>
								<Input
									id="name"
									autoComplete="name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="accountEmail">
									{t("settings.profile.currentEmail")}
								</FieldLabel>
								<Input
									id="accountEmail"
									autoComplete="email"
									value={email}
									type="email"
									readOnly
									aria-readonly="true"
								/>
							</Field>

							<div className="flex items-center gap-3 pt-6">
								<Button
									type="submit"
									disabled={savingProfile || name.trim() === savedName}
								>
									{savingProfile
										? t("common.saving")
										: t("settings.profile.save")}
								</Button>
								{profileStatus && (
									<p className="text-sm text-muted-foreground">
										{profileStatus}
									</p>
								)}
							</div>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("settings.profile.recoveryTitle")}</CardTitle>
					<CardDescription>
						{t("settings.profile.recoveryDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onRecoverySubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="resetEmail">
									{t("settings.profile.emailAddress")}
								</FieldLabel>
								<Input
									id="resetEmail"
									autoComplete="email"
									value={resetEmail}
									onChange={(event) => setResetEmail(event.target.value)}
									type="email"
									placeholder="recovery@example.com"
								/>
							</Field>
							<div className="flex items-center gap-3 pt-6">
								<Button
									type="submit"
									disabled={
										savingRecovery || resetEmail.trim() === savedResetEmail
									}
								>
									{savingRecovery
										? t("common.saving")
										: t("settings.profile.saveRecovery")}
								</Button>
								{recoveryStatus && (
									<p className="text-sm text-muted-foreground">
										{recoveryStatus}
									</p>
								)}
							</div>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</>
	);
}
