import type { TranslationKey } from "@/lib/i18n/types";

export interface AccountSettingsNavItem {
	segment: "" | "password" | "permissions" | "mailboxes";
	labelKey: TranslationKey;
}
