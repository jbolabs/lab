"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { TranslationKey } from "@/lib/i18n/types";
import { NativeSelect } from "@/components/ui/native-select";
import {
	isThemePreference,
	readThemePreference,
	saveThemePreference,
	THEME_CHANGED_EVENT,
	type ThemePreference,
} from "@/components/theme-utils";

const OPTIONS: { value: ThemePreference; labelKey: TranslationKey }[] = [
	{ value: "system", labelKey: "settings.theme.system" },
	{ value: "light", labelKey: "settings.theme.light" },
	{ value: "dark", labelKey: "settings.theme.dark" },
];

export function AppearanceSettings() {
	const { t } = useLanguage();
	const [preference, setPreference] = useState<ThemePreference>("system");

	useEffect(() => {
		setPreference(readThemePreference());
		const sync = () => setPreference(readThemePreference());
		window.addEventListener(THEME_CHANGED_EVENT, sync);
		return () => window.removeEventListener(THEME_CHANGED_EVENT, sync);
	}, []);

	return (
		<label className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
			<span className="flex-1">
				<span className="block text-sm font-medium text-foreground">{t("settings.theme.label")}</span>
				<span className="mt-1 block text-sm text-muted-foreground">
					{t("settings.theme.description")}
				</span>
			</span>
			<NativeSelect
				value={preference}
				aria-label={t("settings.theme.label")}
				className="py-1.5 text-sm text-foreground"
				onChange={(event) => {
					const next = event.target.value;
					if (!isThemePreference(next)) return;
					setPreference(next);
					saveThemePreference(next);
				}}
			>
				{OPTIONS.map((option) => (
					<option key={option.value} value={option.value}>
						{t(option.labelKey)}
					</option>
				))}
			</NativeSelect>
		</label>
	);
}
