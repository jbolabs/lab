"use client";

import { useLanguage } from "@/components/language-provider";
import { ComposeForm } from "@/components/compose/compose-form";

export default function ComposePage() {
	const { t } = useLanguage();
	return (
		<div className="h-full overflow-auto p-8">
			<div className="mb-6">
				<h1 className="text-2xl font-normal text-foreground">{t("compose.pageTitle")}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t("compose.pageDescription")}</p>
			</div>
			<ComposeForm mode="page" />
		</div>
	);
}
