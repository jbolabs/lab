import type { CalendarRepeat } from "@/lib/calendar/types";

export interface CalendarEvent {
	id: string;
	title: string;
	description: string;
	startsAt: string;
	endsAt: string;
	location: string;
	attendees: string;
	color: string;
	repeat: CalendarRepeat;
	repeatDays: string;
	repeatAnchorDay: number | null;
	repeatUntil: string | null;
	excludedOccurrences: string;
	timeZone?: string | null;
	seriesStartsAt?: string;
}

export type CalendarView = "week" | "day";

export interface CalendarEventTimes {
	startsAt: Date;
	endsAt: Date;
}

export interface EventGroup {
	key: string;
	label: string;
	events: CalendarEvent[];
}

export interface EventDragPreview {
	eventId: string;
	day: Date;
	startsAt: Date;
	endsAt: Date;
}

export type EventResizeEdge = "start" | "end";

export interface EventResizeSession {
	event: CalendarEvent;
	day: Date;
	edge: EventResizeEdge;
	columnTop: number;
	pointerY: number;
	moved: boolean;
}
