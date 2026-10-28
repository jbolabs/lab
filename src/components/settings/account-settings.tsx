"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	CardHeader,
	CardTitle,
	CardDescription,
	Card,
	CardContent,
} from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { LanguageSelector } from "@/components/language-selector";
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
				if (!cancelled) setUser(nextUser);
			})
			.catch((err) => {
				if (!cancelled)
					setError(
						err instanceof Error
							? err.message
							: t("settings.account.loadFailed"),
					);
			});
		return () => {
			cancelled = true;
		};
	}, [t]);
	if (error) {
		return (
			<Alert variant="destructive">
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}
	if (!user) {
		return (
			<div className="flex flex-col gap-6 py-4">
				<Skeleton className="h-9 w-40" />
				<Skeleton className="h-72 w-full rounded-lg" />
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-8 py-4">
			<h1 className="text-2xl font-semibold tracking-tight">
				{t("settings.nav.account")}
			</h1>

			<Card>
				<CardHeader>
					<CardTitle>{t("settings.account.detailsTitle")}</CardTitle>
					<CardDescription>
						{t("settings.account.detailsDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-1 overflow-hidden rounded-lg">
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
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("settings.account.generalTitle")}</CardTitle>
					<CardDescription>
						{t("settings.account.generalDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-1 overflow-hidden rounded-lg">
						<div className="py-6">
							<h3 className="mb-3 text-lg font-semibold text-foreground">
								{t("language.label")}
							</h3>
							<div className="max-w-xs [&>div]:px-0 [&_label]:sr-only">
								<LanguageSelector />
							</div>
						</div>
						<TimeZoneForm userId={user.id} initialTimeZone={user.timeZone} />
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
