import { useLanguage } from "@/components/language-provider";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DeviceSettings } from "@/components/settings/device-settings";
import { MfaSettings } from "@/components/settings/mfa-settings";
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
	PageDescription,
} from "@/components/ui/page-header";

export default function SecuritySettingsPage() {
	const { t } = useLanguage();
	return (
		<div className="flex flex-col gap-8 py-4">
			<section className="flex flex-col gap-4">
				<PageHeader>
					<PageHeaderText>
						<PageTitle>{t("settingsPage.security.title")}</PageTitle>
						<PageDescription>
							{t("settingsPage.security.description")}
						</PageDescription>
					</PageHeaderText>
				</PageHeader>
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
