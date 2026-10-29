import type { calendarEvents } from "@/db/schema";

export interface BookingEventInput {
	name: string;
	slug: string;
	description: string;
	color: string;
	hostIds: string[];
	durationMinutes: number;
	location: string;
	weekdays: number[];
	startTime: string;
	endTime: string;
	timeRanges: BookingTimeRange[];
	timeZone: string;
	enabled: boolean;
}

export interface BookingTimeRange {
	startTime: string;
	endTime: string;
}

export type BookingEventRecord = BookingEventInput & {
	id: string;
	userId: string;
};

export type ExistingCalendarEvent = typeof calendarEvents.$inferSelect;
