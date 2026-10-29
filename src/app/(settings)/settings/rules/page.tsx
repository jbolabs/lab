import { getServerTranslator } from "@/lib/i18n/server";
import { InboxRules } from "@/components/settings/inbox-rules";
import { DomainRouting } from "@/components/settings/domain-routing/domain-routing";

export default async function SettingsRulesPage() {
	const t = await getServerTranslator();
	return <div className="flex flex-col gap-8 py-4">
		<h1 className="text-2xl font-semibold tracking-tight">{t("settings.nav.rules")}</h1>
		<DomainRouting />
		<InboxRules />
	</div>;
}
