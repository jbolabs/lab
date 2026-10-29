import { CalendarDays, CalendarClock, HardDrive, Inbox, Settings, ShieldCheck, SquarePen } from "lucide-react";
import type { QuickLink } from "./types";

/** The signed-in home: one tap to each part of Lab. Admin is shown to admins only. */
export const quickLinks: QuickLink[] = [
	{ href: "/inbox", labelKey: "navigation.inbox", icon: Inbox },
	{ href: "/compose", labelKey: "navigation.compose", icon: SquarePen },
	{ href: "/calendar", labelKey: "calendar.calendar", icon: CalendarDays },
	{ href: "/drive", labelKey: "drive.title", icon: HardDrive },
	{ href: "/booking", labelKey: "calendar.bookings", icon: CalendarClock },
	{ href: "/settings", labelKey: "account.settings", icon: Settings },
	{ href: "/admin", labelKey: "account.admin", icon: ShieldCheck, adminOnly: true },
];

/** The name to greet: the first word of the account name, else the address's local part. */
export function greetingName(name: string, email: string): string {
	return name.trim().split(/\s+/)[0] || email.split("@")[0];
}
