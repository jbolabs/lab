"use client";
import { FieldLabel, Field, FieldGroup } from "@/components/ui/field";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
	useEffect(() => {
		const nextName = selectedMailbox?.displayName ?? "";
		setDisplayName(nextName);
		setSavedDisplayName(nextName);
		setStatus(null);
	}, [selectedMailbox?.id, selectedMailbox?.displayName]);
	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedMailbox) return;
		setSaving(true);
		setStatus(null);
		try {
			const updated = await updateCurrentMailboxName(
				selectedMailbox.id,
				displayName,
			);
			setSelectedMailbox(updated);
			setSavedDisplayName(updated.displayName ?? "");
			setDisplayName(updated.displayName ?? "");
			setStatus(t("common.saved"));
		} catch (err) {
			setStatus(
				err instanceof Error ? err.message : t("settings.mailbox.updateFailed"),
			);
		} finally {
			setSaving(false);
		}
	}
	if (isLoading) {
		return (
			<div className="flex flex-col gap-6">
				<Skeleton className="h-8 w-32" />
				<Card className="rounded-lg border-0 bg-card p-6">
					<CardContent className="flex flex-col gap-4 p-6">
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-9 w-28" />
					</CardContent>
				</Card>
			</div>
		);
	}
	if (!selectedMailbox) {
		return (
			<div className="flex flex-col gap-6">
				<h1 className="text-2xl md:text-3xl font-medium text-foreground">
					{t("settings.mailbox.title")}
				</h1>
				<Card className="rounded-lg border-0 bg-card p-6">
					<CardContent className="p-6 text-sm text-muted-foreground">
						{t("settings.mailbox.selectToView")}
					</CardContent>
				</Card>
			</div>
		);
	}
	const address = getMailboxAddress(selectedMailbox);
	const hasChanges = displayName.trim() !== savedDisplayName;
	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="text-2xl md:text-3xl font-medium text-foreground">
					{t("settings.mailbox.title")}
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">{address}</p>
			</div>

			<CardContent className="flex flex-col gap-6 py-6">
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
								<p role="status" className="text-sm text-muted-foreground">
									{status}
								</p>
							)}
						</div>
					</FieldGroup>
				</form>
			</CardContent>
		</div>
	);
}
