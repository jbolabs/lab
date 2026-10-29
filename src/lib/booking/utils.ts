import { normalizeCalendarColor } from "@/lib/calendar/colors";
import {
	dateFromZonedFields,
	isValidTimeZone,
	zonedDateFields,
} from "@/lib/time/utils";

import type {
	BookingEventInput,
	BookingEventRecord,
	BookingTimeRange,
} from "./types";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

export function slugifyBookingName(value: string): string {
	return value
		.normalize("NFKD")
		.replaceAll(/[\u0300-\u036F]/gu, "")
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/gu, "-")
		.replaceAll(/^-|-$/gu, "")
		.slice(0, 80)
		.replace(/-$/u, "");
}

export function isValidBookingSlug(value: string): boolean {
	return (
		value.length >= 1 &&
		value.length <= 80 &&
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)
	);
}

export function normalizeBookingUsername(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const username = value.trim().toLowerCase();
	return username.length >= 1 &&
		username.length <= 64 &&
		/^[a-z0-9._+-]+$/u.test(username) &&
		/[a-z0-9]/u.test(username)
		? username
		: null;
}

export function bookingUsernameFromEmail(email: string): string {
	const localPart = email.split("@")[0] ?? "";
	const candidate = localPart
		.normalize("NFKD")
		.replaceAll(/[\u0300-\u036F]/gu, "")
		.toLowerCase()
		.replaceAll(/[^a-z0-9._+-]+/gu, "-")
		.slice(0, 56);
	return normalizeBookingUsername(candidate) ?? "user";
}

export function parseBookingTimeRanges(
	value: string,
	fallback?: BookingTimeRange
): BookingTimeRange[] {
	try {
		const parsed: unknown = JSON.parse(value);
		if (
			Array.isArray(parsed) &&
			parsed.length &&
			parsed.every(
				(range) =>
					range &&
					typeof range === "object" &&
					typeof range.startTime === "string" &&
					typeof range.endTime === "string"
			)
		) {
			return parsed as BookingTimeRange[];
		}
	} catch {
		/* Older rows use the single time window. */
	}
	return fallback ? [fallback] : [];
}

export function timeToMinutes(value: string): number {
	const [hours, minutes] = value.split(":").map(Number);
	return hours * 60 + minutes;
}

function validHostIds(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.length <= 20 &&
		value.every((id) => typeof id === "string" && !!id) &&
		new Set(value).size === value.length
	);
}
function validWeekdays(value: unknown): value is number[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
		new Set(value).size === value.length
	);
}
function validTimeRanges(
	timeRanges: unknown,
	durationMinutes: number
): timeRanges is BookingTimeRange[] {
	if (
		!Array.isArray(timeRanges) ||
		!timeRanges.length ||
		timeRanges.length > 12
	) {
		return false;
	}
	if (
		timeRanges.some(
			(range) =>
				!range ||
				typeof range !== "object" ||
				typeof range.startTime !== "string" ||
				typeof range.endTime !== "string" ||
				!timePattern.test(range.startTime) ||
				!timePattern.test(range.endTime) ||
				timeToMinutes(range.startTime) % 15 !== 0 ||
				timeToMinutes(range.endTime) % 15 !== 0 ||
				timeToMinutes(range.endTime) - timeToMinutes(range.startTime) <
					durationMinutes
		)
	) {
		return false;
	}
	return true;
}

function validBookingMetadata(
	name: string,
	slug: string,
	description: string,
	location: string
): boolean {
	return (
		!!name &&
		name.length <= 120 &&
		isValidBookingSlug(slug) &&
		description.length <= 2000 &&
		location.length <= 240
	);
}
function validBookingDuration(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 5 &&
		value <= 480
	);
}

function bookingText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export function parseBookingEventInput(
	value: unknown
): BookingEventInput | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const input = value as Record<string, unknown>;
	const name = bookingText(input.name);
	const slug =
		typeof input.slug === "string"
			? input.slug.trim().toLowerCase()
			: slugifyBookingName(name);
	const description = bookingText(input.description);
	const location = bookingText(input.location);
	const { weekdays } = input;
	const hostIds = input.hostIds === undefined ? [] : input.hostIds;
	if (
		!validBookingMetadata(name, slug, description, location) ||
		!validBookingDuration(input.durationMinutes)
	) {
		return null;
	}

	if (!validHostIds(hostIds) || !validWeekdays(weekdays)) {
		return null;
	}
	const timeRanges: unknown =
		input.timeRanges ??
		(typeof input.startTime === "string" && typeof input.endTime === "string"
			? [{ endTime: input.endTime, startTime: input.startTime }]
			: null);
	if (!validTimeRanges(timeRanges, input.durationMinutes)) {
		return null;
	}
	const normalizedRanges = [...(timeRanges as BookingTimeRange[])].toSorted(
		(a, b) => a.startTime.localeCompare(b.startTime)
	);
	if (
		normalizedRanges.some(
			(range, index) =>
				index > 0 && range.startTime < normalizedRanges[index - 1].endTime
		)
	) {
		return null;
	}
	if (
		typeof input.timeZone !== "string" ||
		!isValidTimeZone(input.timeZone) ||
		typeof input.enabled !== "boolean"
	) {
		return null;
	}
	return {
		color: normalizeCalendarColor(
			typeof input.color === "string" ? input.color : undefined
		),
		description,
		durationMinutes: input.durationMinutes,
		enabled: input.enabled,
		endTime: normalizedRanges[0].endTime,
		hostIds,
		location,
		name,
		slug,
		startTime: normalizedRanges[0].startTime,
		timeRanges: normalizedRanges,
		timeZone: input.timeZone,
		weekdays: [...weekdays].toSorted(),
	};
}

export function slotFromLocalDate(
	event: BookingEventRecord,
	localDate: string,
	time: string
): { startsAt: Date; endsAt: Date } | null {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(localDate) || !timePattern.test(time)) {
		return null;
	}
	const wall = new Date(`${localDate}T${time}:00Z`);
	if (
		Number.isNaN(wall.getTime()) ||
		wall.toISOString().slice(0, 10) !== localDate ||
		!event.weekdays.includes(wall.getUTCDay())
	) {
		return null;
	}
	const minutes = timeToMinutes(time);
	if (
		!event.timeRanges.some(
			(range) =>
				minutes >= timeToMinutes(range.startTime) &&
				minutes + event.durationMinutes <= timeToMinutes(range.endTime)
		) ||
		minutes % 15 !== 0
	) {
		return null;
	}
	const startsAt = dateFromZonedFields(wall, event.timeZone);
	if (
		zonedDateFields(startsAt, event.timeZone).toISOString().slice(0, 16) !==
		`${localDate}T${time}`
	) {
		return null;
	}
	return {
		endsAt: new Date(startsAt.getTime() + event.durationMinutes * 60_000),
		startsAt,
	};
}

export function parseBookingWeekdays(value: string): number[] {
	try {
		const days: unknown = JSON.parse(value);
		return Array.isArray(days)
			? days.filter(
					(day): day is number => Number.isInteger(day) && day >= 0 && day <= 6
				)
			: [];
	} catch {
		return [];
	}
}
