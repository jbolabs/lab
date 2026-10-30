import { useLanguage } from "@/components/language-provider";
import { DomainRouting } from "@/components/settings/domain-routing/domain-routing";
import { InboxRules } from "@/components/settings/inbox-rules";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";

export default function SettingsRulesPage() {
	const { t } = useLanguage();
	return (
		<div className="flex flex-col gap-8 py-4">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("settings.nav.rules")}</PageTitle>
				</PageHeaderText>
			</PageHeader>
			<DomainRouting />
			<InboxRules />
		</div>
	);
}
