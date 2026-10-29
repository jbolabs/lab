"use client";

import { ComposeForm } from "@/components/compose/compose-form";
import { useLanguage } from "@/components/language-provider";
import {
	PageDescription,
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";

export default function ComposePage() {
	const { t } = useLanguage();
	return (
		<div className="flex h-full flex-col gap-6 overflow-auto p-8">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("compose.pageTitle")}</PageTitle>
					<PageDescription>{t("compose.pageDescription")}</PageDescription>
				</PageHeaderText>
			</PageHeader>
			<ComposeForm mode="page" />
		</div>
	);
}
