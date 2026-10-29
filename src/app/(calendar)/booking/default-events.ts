import { DEFAULT_FOLDER_COLOR } from "@/lib/folders/colors";

import type { BookingEvent } from "./types";

const DEFAULT_EVENTS = [
	{
		durationMinutes: 30,
		endTime: "11:00",
		id: "template:30-minute",
		name: "30 Minute Meeting",
		slug: "30-minute-meeting",
		startTime: "09:00",
	},
	{
		durationMinutes: 15,
		endTime: "16:00",
		id: "template:15-minute",
		name: "15 Minute Meeting",
		slug: "15-minute-meeting",
		startTime: "14:00",
	},
] as const;

export function visibleBookingEvents(
	events: BookingEvent[],
	userId: string,
	timeZone: string
): BookingEvent[] {
	if (
		!userId ||
		events.some(
			(event) =>
				!DEFAULT_EVENTS.some((template) => template.slug === event.slug)
		)
	) {
		return events;
	}
	const existingSlugs = new Set(events.map((event) => event.slug));
	const templates: BookingEvent[] = DEFAULT_EVENTS.filter(
		(template) => !existingSlugs.has(template.slug)
	).map((template) => ({
		...template,
		color: DEFAULT_FOLDER_COLOR,
		description: "",
		enabled: false,
		hostIds: JSON.stringify([userId]),
		isTemplate: true as const,
		location: "",
		timeRanges: JSON.stringify([
			{ endTime: template.endTime, startTime: template.startTime },
		]),
		timeZone,
		userId,
		weekdays: "[1,2,3,4,5]",
	}));
	return [...events, ...templates];
}
