"use client";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { LanguageSelector } from "@/components/language-selector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	CardHeader,
	CardTitle,
	CardDescription,
	Card,
	CardContent,
} from "@/components/ui/card";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

import { ForwardingEmailForm } from "./forwarding-email-form";
import { MailboxSignatureForm } from "./mailbox-signature-form";
import { ProfileForm } from "./profile-form";
import { TimeZoneForm } from "./time-zone-form";
import type { AccountSettingsResponse } from "./types";
import { loadAccountSettings } from "./utils";

export function AccountSettings() {
	const { t } = useLanguage();
	const [user, setUser] = useState<AccountSettingsResponse["user"]>();
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		loadAccountSettings()
			.then((nextUser) => {
				if (!cancelled) {
					setUser(nextUser);
				}

				return null;
			})
			.catch((error_) => {
				if (!cancelled) {
					setError(
						error_ instanceof Error
							? error_.message
							: t("settings.account.loadFailed")
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [t]);
	if (error) {
		return (
			<Alert variant="error">
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}
	if (!user) {
		return (
			<div className="flex flex-col gap-6 py-4">
				<Skeleton className="h-9 w-40" />
				<Skeleton className="h-72 w-full" />
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-8 py-4">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("settings.nav.account")}</PageTitle>
				</PageHeaderText>
			</PageHeader>

			<ProfileForm
				initialName={user.name}
				initialResetEmail={user.resetEmail ?? ""}
				email={user.email}
			/>
			{user.canForwardEmail && (
				<Card>
					<CardHeader>
						<CardTitle>{t("settings.account.forwardingTitle")}</CardTitle>
						<CardDescription>
							{t("settings.account.forwardingDescription")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ForwardingEmailForm
							initialForwardingEmail={user.forwardingEmail ?? ""}
						/>
					</CardContent>
				</Card>
			)}
			<Card>
				<CardHeader>
					<CardTitle>{t("settings.account.signatureTitle")}</CardTitle>
					<CardDescription>
						{t("settings.account.signatureDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<MailboxSignatureForm />
				</CardContent>
			</Card>
			<section
				className="flex flex-col gap-6"
				aria-labelledby="general-settings"
			>
				<div className="flex flex-col gap-2">
					<h2
						id="general-settings"
						className="font-heading text-lg font-medium"
					>
						{t("settings.account.generalTitle")}
					</h2>
					<p className="text-sm text-muted-foreground">
						{t("settings.account.generalDescription")}
					</p>
				</div>
				<Card>
					<CardHeader>
						<CardTitle>{t("language.label")}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="max-w-xs [&_label]:sr-only">
							<LanguageSelector />
						</div>
					</CardContent>
				</Card>
				<TimeZoneForm userId={user.id} initialTimeZone={user.timeZone} />
			</section>
		</div>
	);
}
