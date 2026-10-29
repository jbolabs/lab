import { EmailClientsSettings } from "@/components/settings/email-clients-settings";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
} from "@/components/ui/card";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";
import { getServerTranslator } from "@/lib/i18n/server";

export default async function EmailAppsSettingsPage() {
	const t = await getServerTranslator();
	return (
		<div className="flex flex-col gap-8 py-4">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("settingsPage.appPasswords.title")}</PageTitle>
				</PageHeaderText>
			</PageHeader>
			<Card>
				<CardHeader>
					<CardTitle>{t("emailClients.defaultName")}</CardTitle>
					<CardDescription>
						{t("settingsPage.appPasswords.description")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<EmailClientsSettings />
				</CardContent>
			</Card>
		</div>
	);
}
