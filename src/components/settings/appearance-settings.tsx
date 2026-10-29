"use client";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { TranslationKey } from "@/lib/i18n/types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
	isThemePreference,
	readThemePreference,
	saveThemePreference,
	THEME_CHANGED_EVENT,
	type ThemePreference,
} from "@/components/theme-utils";
const OPTIONS: {
	value: ThemePreference;
	labelKey: TranslationKey;
}[] = [
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
		<Field>
			<FieldLabel>{t("settings.theme.label")}</FieldLabel>
			<FieldDescription>{t("settings.theme.description")}</FieldDescription>
			<ToggleGroup
				type="single"
				variant="outline"
				value={preference}
				aria-label={t("settings.theme.label")}
				onValueChange={(next) => {
					if (isThemePreference(next)) {
						setPreference(next);
						saveThemePreference(next);
					}
				}}
				className="w-full justify-start"
			>
				{OPTIONS.map((option) => (
					<ToggleGroupItem
						key={option.value}
						value={option.value}
						className="min-h-11 flex-1"
					>
						{t(option.labelKey)}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</Field>
	);
}
