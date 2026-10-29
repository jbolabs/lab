"use client";

import { Save } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyDescription } from "@/components/ui/empty";
import { FieldLabel, Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { withCleanup } from "@/lib/async-cleanup";

import { ProfileAvatarForm } from "./profile-avatar-form";
import { getMailboxAddress, updateCurrentMailboxName } from "./utils";

export function CurrentMailboxForm() {
	const { t } = useLanguage();
	const { selectedMailbox, setSelectedMailbox, isLoading } =
		useSelectedMailbox();
	const [displayName, setDisplayName] = useState("");
	const [savedDisplayName, setSavedDisplayName] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const resetKey = JSON.stringify([
		selectedMailbox?.id,
		selectedMailbox?.displayName,
	]);
	const [previousResetKey, setPreviousResetKey] = useState<string | null>(null);
	if (previousResetKey !== resetKey) {
		setPreviousResetKey(resetKey);
		const nextName = selectedMailbox?.displayName ?? "";
		setDisplayName(nextName);
		setSavedDisplayName(nextName);
		setStatus(null);
	}

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox) {
			return;
		}
		setSaving(true);
		setStatus(null);
		return await withCleanup(
			async () => {
				try {
					const updated = await updateCurrentMailboxName(
						selectedMailbox.id,
						displayName
					);
					setSelectedMailbox(updated);
					setSavedDisplayName(updated.displayName ?? "");
					setDisplayName(updated.displayName ?? "");
					setStatus(t("common.saved"));
				} catch (error) {
					setStatus(
						error instanceof Error
							? error.message
							: t("settings.mailbox.updateFailed")
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
			<div className="flex flex-col gap-6">
				<Skeleton className="h-8 w-32" />
				<div className="flex flex-col gap-4 py-6">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-28" />
				</div>
			</div>
		);
	}
	if (!selectedMailbox) {
		return (
			<div className="flex flex-col gap-6">
				<PageHeader>
					<PageHeaderText>
						<PageTitle>{t("settings.mailbox.title")}</PageTitle>
					</PageHeaderText>
				</PageHeader>
				<Empty>
					<EmptyHeader>
						<EmptyDescription>
							{t("settings.mailbox.selectToView")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}
	const address = getMailboxAddress(selectedMailbox);
	const hasChanges = displayName.trim() !== savedDisplayName;
	return (
		<div className="flex flex-col gap-8">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("settings.mailbox.title")}</PageTitle>
					<PageDescription>{address}</PageDescription>
				</PageHeaderText>
			</PageHeader>

			<div className="flex flex-col gap-6">
				<ProfileAvatarForm
					mailboxId={selectedMailbox.id}
					initialHasAvatar={!!selectedMailbox.hasAvatar}
					name={selectedMailbox.displayName || selectedMailbox.localPart}
					colorSeed={address}
				/>
				<form onSubmit={onSubmit} className="flex flex-col gap-4">
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="displayName">{t("common.name")}</FieldLabel>
							<Input
								id="displayName"
								value={displayName}
								onChange={(event) => setDisplayName(event.target.value)}
								placeholder={selectedMailbox.localPart}
								disabled={saving}
							/>
						</Field>
						<div className="flex items-center gap-3">
							<Button type="submit" disabled={saving || !hasChanges}>
								<Save data-icon="inline-start" />
								{saving
									? t("common.saving")
									: t("settings.mailbox.saveChanges")}
							</Button>
							{status && (
								<output className="text-sm text-muted-foreground">
									{status}
								</output>
							)}
						</div>
					</FieldGroup>
				</form>
			</div>
		</div>
	);
}
