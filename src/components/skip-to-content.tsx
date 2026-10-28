"use client";

import { useLanguage } from "@/components/language-provider";

export function SkipToContent() {
	const { t } = useLanguage();
	return (
		<a
			href="#main-content"
			className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-signal focus:shadow-lg focus:ring-2 focus:ring-ring"
		>
			{t("a11y.skipToContent")}
		</a>
	);
}
