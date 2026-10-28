import { CalendarDays, FileText, HardDrive, Inbox, Send } from "lucide-react";
import type { HomeAction, MailPreview, SidebarItem } from "./types";

export const sidebarItems: SidebarItem[] = [
	{ labelKey: "navigation.inbox", icon: Inbox, active: true, count: "3" },
	{ labelKey: "navigation.sent", icon: Send },
	{ labelKey: "navigation.drafts", icon: FileText, count: "1" },
	{ labelKey: "calendar.calendar", icon: CalendarDays },
	{ labelKey: "drive.title", icon: HardDrive },
];

/** Decorative sample rows for the signed-out preview. */
export const heroMessages: MailPreview[] = [
	{ sender: "Maya Chen", subject: "Kickoff notes", preview: "Thanks for today. Attached the brief and the timeline we sketched.", time: "9:41", unread: true },
	{ sender: "Northwind", subject: "Invoice 1042 paid", preview: "Payment received. A receipt is attached for your records.", time: "8:15", unread: true },
	{ sender: "Sam Ortiz", subject: "Launch checklist", preview: "DNS is live, redirects are in. Two small copy edits left.", time: "Tue" },
	{ sender: "Priya Raman", subject: "Coffee next week?", preview: "I'm around Thursday morning if that works for you.", time: "Mon" },
];

export function getHomeActions(isLoggedIn: boolean): HomeAction[] {
	if (isLoggedIn) {
		return [{ href: "/inbox", labelKey: "home.dashboard", variant: "default" }];
	}

	return [
		{ href: "/setup", labelKey: "home.createAccount", variant: "ghost" },
		{ href: "/login", labelKey: "home.logIn", variant: "default" },
	];
}
