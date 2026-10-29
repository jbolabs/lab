import type { TranslationKey } from "@/lib/i18n/types";

export interface SettingsNavItem {
	href: string;
	labelKey: TranslationKey;
	requiresMailboxAccess?: boolean;
}

export interface SettingsNavSection {
	labelKey: TranslationKey;
	items: SettingsNavItem[];
}
