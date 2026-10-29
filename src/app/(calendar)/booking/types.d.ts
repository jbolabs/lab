import type { BookingTimeRange } from "@/lib/booking/types";

export interface BookingEvent {
	id: string;
	userId: string;
	name: string;
	slug: string;
	description: string;
	color: string;
	hostIds: string;
	durationMinutes: number;
	location: string;
	weekdays: string;
	startTime: string;
	endTime: string;
	timeRanges: string;
	timeZone: string;
	enabled: boolean;
	isTemplate?: true;
}

export interface BookingForm {
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

export interface BookingHost {
	id: string;
	name: string;
	email: string;
	hasAvatar?: boolean;
}

export interface BookingHostAvatarProps {
	host: BookingHost;
	currentUserId: string;
	size?: "small" | "medium";
}

export interface BookingHostMatch {
	host: BookingHost | null;
	error: string;
}

export type BookingEditorSection =
	| "event"
	| "duration"
	| "location"
	| "availability"
	| "host"
	| null;
