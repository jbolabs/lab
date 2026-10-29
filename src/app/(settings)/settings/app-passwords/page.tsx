import { getServerTranslator } from "@/lib/i18n/server";
import { EmailClientsSettings } from "@/components/settings/email-clients-settings";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default async function EmailAppsSettingsPage() {
	const t = await getServerTranslator();
	return <div className="flex flex-col gap-8 py-4">
		<h1 className="text-2xl font-semibold tracking-tight">{t("settingsPage.appPasswords.title")}</h1>
		<Card><CardHeader><CardTitle>{t("emailClients.defaultName")}</CardTitle><CardDescription>{t("settingsPage.appPasswords.description")}</CardDescription></CardHeader><CardContent><EmailClientsSettings /></CardContent></Card>
	</div>;
}
