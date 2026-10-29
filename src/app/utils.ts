import {
	CalendarDays,
	CalendarClock,
	HardDrive,
	Inbox,
	Settings,
	ShieldCheck,
	SquarePen,
} from "lucide-react";

import type { QuickLink } from "./types";

/** The signed-in home: one tap to each part of Lab. Admin is shown to admins only. */
export const quickLinks: QuickLink[] = [
	{ href: "/inbox", icon: Inbox, labelKey: "navigation.inbox" },
	{ href: "/compose", icon: SquarePen, labelKey: "navigation.compose" },
	{ href: "/calendar", icon: CalendarDays, labelKey: "calendar.calendar" },
	{ href: "/drive", icon: HardDrive, labelKey: "drive.title" },
	{ href: "/booking", icon: CalendarClock, labelKey: "calendar.bookings" },
	{ href: "/settings", icon: Settings, labelKey: "account.settings" },
	{
		adminOnly: true,
		href: "/admin",
		icon: ShieldCheck,
		labelKey: "account.admin",
	},
];

/** The name to greet: the first word of the account name, else the address's local part. */
export function greetingName(name: string, email: string): string {
	return name.trim().split(/\s+/u)[0] || email.split("@")[0];
}
