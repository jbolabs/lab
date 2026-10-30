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

// Pages reached from another page rather than from the nav, and where they go back to.
const adminParents: Record<string, string> = {
	"/ai-usage": "/agent",
};

// Where the phone top bar's back button goes: the declared parent, or the nearest titled
// ancestor of a detail page (`/accounts/usr_1/permissions` → `/accounts`). Nav pages have none.
export function getAdminBackPath(pathname: string): string | null {
	if (adminParents[pathname]) {
		return adminParents[pathname];
	}
	if (adminPageTitles[pathname]) {
		return null;
	}
	const segments = pathname.split("/").filter(Boolean);
	for (let length = segments.length - 1; length > 0; length -= 1) {
		const candidate = `/${segments.slice(0, length).join("/")}`;
		if (adminPageTitles[candidate]) {
			return candidate;
		}
	}
	return null;
}
