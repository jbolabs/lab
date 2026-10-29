import type { AdminApiKeyScope } from "@/lib/api/scopes-types";
import type { TranslationKey } from "@/lib/i18n/types";

export const ADMIN_KEY_PERMISSIONS: {
	value: AdminApiKeyScope;
	labelKey: TranslationKey;
	descriptionKey: TranslationKey;
}[] = [
	{
		descriptionKey: "adminKeys.perm.domainsDesc",
		labelKey: "adminKeys.perm.domains",
		value: "domains",
	},
	{
		descriptionKey: "adminKeys.perm.accountsDesc",
		labelKey: "adminKeys.perm.accounts",
		value: "accounts",
	},
	{
		descriptionKey: "adminKeys.perm.mailboxesDesc",
		labelKey: "adminKeys.perm.mailboxes",
		value: "mailboxes",
	},
	{
		descriptionKey: "adminKeys.perm.storageDesc",
		labelKey: "adminKeys.perm.storage",
		value: "storage",
	},
];

export function parseApiKeyScopes(scopes: string): string[] {
	try {
		const parsed = JSON.parse(scopes);
		return Array.isArray(parsed)
			? parsed.filter((scope) => typeof scope === "string")
			: [];
	} catch {
		return [];
	}
}
