const sectionIcons: Record<string, string> = {
	inbox: "inbox", sent: "inbox", drafts: "inbox", compose: "inbox",
	starred: "inbox", scheduled: "inbox", snoozed: "inbox", archived: "inbox",
	spam: "inbox", trash: "inbox", folders: "inbox",
	drive: "drive", calendar: "calendar", booking: "booking", book: "booking",
	settings: "settings", agent: "agent",
	admin: "admin", accounts: "admin", mailboxes: "admin", domains: "admin",
	routing: "admin", webhooks: "admin", "api-keys": "admin", general: "admin",
	activity: "admin", backups: "admin", branding: "admin", licenses: "admin", "ai-usage": "admin",
};

export const DEFAULT_FAVICON = "/favicons/lab.png";

/** Match full path segments so /driveway never inherits Drive's icon. */
export function getSectionIcon(pathname: string): string {
	const section = pathname.split("/")[1];
	const icon = Object.hasOwn(sectionIcons, section) ? sectionIcons[section] : undefined;
	return icon ? `/favicons/${icon}.svg` : DEFAULT_FAVICON;
}

export function setSectionFavicon(document: Document, pathname: string) {
	const icon = document.querySelector<HTMLLinkElement>("link#lab-favicon[rel='icon']");
	if (!icon) return;
	const href = getSectionIcon(pathname);
	icon.href = href;
	icon.type = href.endsWith(".svg") ? "image/svg+xml" : "image/png";
	icon.setAttribute("sizes", href.endsWith(".svg") ? "any" : "512x512");
}
