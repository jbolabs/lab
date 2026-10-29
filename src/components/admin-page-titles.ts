import type { TranslationKey } from "@/lib/i18n/types";

// Titles shown in the phone top bar, keyed by exact path. Detail pages are absent on purpose:
// they keep their own in-page heading.
export const adminPageTitles: Record<string, TranslationKey> = {
	"/accounts": "admin.nav.accounts",
	"/activity": "admin.nav.activity",
	"/admin": "admin.title",
	"/agent": "admin.nav.agent",
	"/ai-usage": "admin.page.aiUsage",
	"/api-keys": "admin.section.apiKeysTitle",
	"/backups": "admin.nav.backups",
	"/branding": "admin.nav.branding",
	"/domains": "admin.nav.domains",
	"/general": "admin.nav.general",
	"/mailboxes": "admin.nav.mailboxes",
	"/routing": "admin.nav.routing",
	"/webhooks": "admin.nav.webhooks",
};
