import {
	CardHeader,
	CardTitle,
	CardDescription,
	Card,
	CardContent,
} from "@/components/ui/card";
import { getServerTranslator } from "@/lib/i18n/server";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { MfaSettings } from "@/components/settings/mfa-settings";
import { DeviceSettings } from "@/components/settings/device-settings";
export default async function SecuritySettingsPage() {
	const t = await getServerTranslator();
	return (
		<div className="flex flex-col gap-8 py-4">
			<section className="flex flex-col gap-4">
				<div>
					<h1 className="text-xl font-semibold text-foreground">
						{t("settingsPage.security.title")}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("settingsPage.security.description")}
					</p>
				</div>
				<Card>
					<CardHeader>
						<CardTitle>{t("settingsPage.security.changePassword")}</CardTitle>
						<CardDescription>
							{t("settingsPage.security.changePasswordDescription")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ChangePasswordForm />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>{t("settingsPage.security.mfa")}</CardTitle>
						<CardDescription>
							{t("settingsPage.security.mfaDescription")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<MfaSettings />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>{t("settingsPage.security.devices")}</CardTitle>
						<CardDescription>
							{t("settingsPage.security.devicesDescription")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<DeviceSettings />
					</CardContent>
				</Card>
			</section>
		</div>
	);
}
