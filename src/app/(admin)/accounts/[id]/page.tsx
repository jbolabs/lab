"use client";
import { Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { ProgressiveAvatarImage } from "@/components/progressive-avatar-image";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	FieldLabel,
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { runAsyncAction } from "@/lib/async-cleanup";

import type { ManagedAccount } from "./types";
import {
	fetchManagedAccount,
	getManagedAccountAvatarUrl,
	saveManagedAccount,
	uploadManagedAccountAvatar,
} from "./utils";

export default function AccountDetailsPage() {
	const { t } = useLanguage();
	const { id } = useParams<{ id: string }>();
	const [account, setAccount] = useState<ManagedAccount | null>(null);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [avatarVersion, setAvatarVersion] = useState(0);

	useEffect(() => {
		runAsyncAction(
			async () => {
				const result0 = await fetchManagedAccount(id);
				setAccount(result0);
			},
			(failure) =>
				setMessage(
					failure instanceof Error ? failure.message : t("account.loadFailed")
				)
		);
	}, [id, t]);

	function saveDetails() {
		if (!account) {
			return;
		}
		setSaving(true);
		setMessage(null);
		return runAsyncAction(
			async () => {
				await saveManagedAccount(account);
				setMessage(t("account.updated"));
			},
			(failure) => {
				setMessage(
					failure instanceof Error ? failure.message : t("account.updateFailed")
				);
			},
			() => {
				setSaving(false);
			}
		);
	}

	async function uploadAvatar(file: File | undefined) {
		if (!file || !account) {
			return;
		}
		try {
			await uploadManagedAccountAvatar(account.id, file);
			setAccount({ ...account, hasAvatar: true });
			setAvatarVersion(Date.now());
		} catch (error) {
			setMessage(
				error instanceof Error ? error.message : t("account.avatarFailed")
			);
		}
	}

	if (!account) {
		return (
			<p className="text-sm text-muted-foreground">
				{message ?? t("account.loadingAccount")}
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("account.detailsTitle")}</PageTitle>
					<PageDescription>{t("account.detailsDescription")}</PageDescription>
				</PageHeaderText>
			</PageHeader>
			<FieldGroup>
				{!account.editable && (
					<Alert variant="muted">
						<AlertDescription>{t("account.noPermission")}</AlertDescription>
					</Alert>
				)}
				<div className="flex items-center gap-4">
					<span className="relative flex size-16 items-center justify-center overflow-hidden rounded-full bg-signal-soft text-xl font-semibold text-signal">
						{account.name.charAt(0).toUpperCase()}
						{account.hasAvatar && (
							<ProgressiveAvatarImage
								src={getManagedAccountAvatarUrl(id, avatarVersion)}
								alt=""
								className="absolute inset-0 size-full object-cover"
							/>
						)}
					</span>
					{account.editable && (
						<Button
							variant="outline"
							// oxlint-disable-next-line jsx-a11y/label-has-associated-control -- Base UI render: the text is this component's children.
							render={<label className="cursor-pointer" />}
							nativeButton={false}
						>
							<Upload />
							{t("account.changeAvatar")}
							<Input
								type="file"
								accept="image/jpeg,image/png,image/webp,image/gif"
								className="sr-only"
								onChange={(event) => uploadAvatar(event.target.files?.[0])}
							/>
						</Button>
					)}
				</div>
				<Field>
					<FieldLabel htmlFor="account-email">{t("auth.email")}</FieldLabel>
					<Input
						id="account-email"
						value={account.email}
						readOnly
						className=""
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="account-name">{t("common.name")}</FieldLabel>
					<Input
						id="account-name"
						value={account.name}
						disabled={!account.editable}
						onChange={(event) =>
							setAccount({ ...account, name: event.target.value })
						}
					/>
				</Field>
				{account.canForwardEmail && (
					<Field>
						<FieldLabel htmlFor="forwarding-email">
							{t("account.forwardingOptional")}
						</FieldLabel>
						<Input
							id="forwarding-email"
							type="email"
							value={account.forwardingEmail ?? ""}
							disabled={!account.editable}
							onChange={(event) =>
								setAccount({
									...account,
									forwardingEmail: event.target.value || null,
								})
							}
							placeholder="destination@example.com"
						/>
						<FieldDescription>{t("settings.forwarding.hint")}</FieldDescription>
					</Field>
				)}
				<Field orientation="horizontal">
					<FieldContent>
						<FieldLabel htmlFor="account-enabled">
							{t("account.enabled")}
						</FieldLabel>
						<FieldDescription id="account-enabled-description">
							{account.isPrimaryAdmin
								? t("account.primaryAlwaysEnabled")
								: t("account.allowSignIn")}
						</FieldDescription>
					</FieldContent>
					<Switch
						id="account-enabled"
						aria-describedby="account-enabled-description"
						checked={!account.disabled}
						disabled={saving || !account.editable || account.isPrimaryAdmin}
						onCheckedChange={(enabled) =>
							setAccount({ ...account, disabled: !enabled })
						}
					/>
				</Field>
				{account.editable && (
					<Button
						onClick={() => saveDetails()}
						disabled={saving || !account.name.trim()}
					>
						{saving ? t("common.saving") : t("account.saveDetails")}
					</Button>
				)}
			</FieldGroup>
			{message && (
				<output className="text-sm text-muted-foreground">{message}</output>
			)}
		</div>
	);
}
