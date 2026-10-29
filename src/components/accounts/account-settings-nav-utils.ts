import type { AccountSettingsNavItem } from "./account-settings-nav-types";

export const accountSettingsNavItems: AccountSettingsNavItem[] = [
	{ labelKey: "accountSettings.details", segment: "" },
	{ labelKey: "accountSettings.password", segment: "password" },
	{ labelKey: "accountSettings.permissions", segment: "permissions" },
	{ labelKey: "accountSettings.mailboxes", segment: "mailboxes" },
];

export function getAccountSettingsHref(
	accountId: string,
	segment: AccountSettingsNavItem["segment"]
): string {
	return `/accounts/${accountId}${segment ? `/${segment}` : ""}`;
}

export function isActiveAccountSettingsPath(
	pathname: string,
	href: string
): boolean {
	return pathname === href;
}
