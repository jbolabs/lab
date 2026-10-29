"use client";
import { useSyncExternalStore } from "react";

import { useLanguage } from "@/components/language-provider";
import {
	isThemePreference,
	readThemePreference,
	saveThemePreference,
	THEME_CHANGED_EVENT,
} from "@/components/theme-utils";
import type { ThemePreference } from "@/components/theme-utils";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TranslationKey } from "@/lib/i18n/types";

const OPTIONS: {
	value: ThemePreference;
	labelKey: TranslationKey;
}[] = [
	{ labelKey: "settings.theme.system", value: "system" },
	{ labelKey: "settings.theme.light", value: "light" },
	{ labelKey: "settings.theme.dark", value: "dark" },
];
function subscribeTheme(notify: () => void) {
	window.addEventListener(THEME_CHANGED_EVENT, notify);
	window.addEventListener("storage", notify);
	return () => {
		window.removeEventListener(THEME_CHANGED_EVENT, notify);
		window.removeEventListener("storage", notify);
	};
}
function serverPreference(): ThemePreference {
	return "system";
}
export function AppearanceSettings() {
	const { t } = useLanguage();
	const preference = useSyncExternalStore(
		subscribeTheme,
		readThemePreference,
		serverPreference
	);
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
						saveThemePreference(next);
					}
				}}
				className="w-full justify-start"
			>
				{OPTIONS.map((option) => (
					<ToggleGroupItem
						key={option.value}
						value={option.value}
						className="flex-1"
					>
						{t(option.labelKey)}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</Field>
	);
}
