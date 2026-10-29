import { parseBookingHostIds } from "@/lib/booking/hosts";
import type { BookingTimeRange } from "@/lib/booking/types";
import {
	parseBookingTimeRanges,
	timeToMinutes,
	slugifyBookingName,
} from "@/lib/booking/utils";
import { normalizeCalendarColor } from "@/lib/calendar/colors";
import { DEFAULT_FOLDER_COLOR } from "@/lib/folders/colors";
import type { TranslationKey } from "@/lib/i18n/types";
import { defaultTranslator } from "@/lib/i18n/utils";
import type { Translator } from "@/lib/i18n/utils";

import type {
	BookingEvent,
	BookingForm,
	BookingHost,
	BookingHostMatch,
} from "./types";

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function emptyBookingForm(
	timeZone: string,
	currentUserId: string
): BookingForm {
	return {
		color: DEFAULT_FOLDER_COLOR,
		description: "",
		durationMinutes: 30,
		enabled: true,
		endTime: "17:00",
		hostIds: [currentUserId],
		location: "",
		name: "",
		slug: "",
		startTime: "09:00",
		timeRanges: [{ endTime: "17:00", startTime: "09:00" }],
		timeZone,
		weekdays: [1, 2, 3, 4, 5],
	};
}

export function formFromEvent(event: BookingEvent): BookingForm {
	let weekdays: number[] = [];
	try {
		weekdays = JSON.parse(event.weekdays) as number[];
	} catch {
		/* An invalid saved schedule remains editable. */
	}
	return {
		color: normalizeCalendarColor(event.color),
		description: event.description ?? "",
		durationMinutes: event.durationMinutes,
		enabled: event.enabled,
		endTime: event.endTime,
		hostIds: parseBookingHostIds(event.hostIds, event.userId),
		location: event.location,
		name: event.name,
		slug: event.slug,
		startTime: event.startTime,
		timeRanges: parseBookingTimeRanges(event.timeRanges, {
			endTime: event.endTime,
			startTime: event.startTime,
		}),
		timeZone: event.timeZone,
		weekdays,
	};
}

export function bookingFormWithName(
	form: BookingForm,
	name: string
): BookingForm {
	return {
		...form,
		name,
		slug:
			!form.slug || form.slug === slugifyBookingName(form.name)
				? slugifyBookingName(name)
				: form.slug,
	};
}

export function matchBookingHost(
	hosts: BookingHost[],
	value: string,
	t: Translator = defaultTranslator
): BookingHostMatch {
	const query = value.trim().toLowerCase();
	if (!query) {
		return { error: t("booking.host.enterNameOrEmail"), host: null };
	}
	if (query.includes("@")) {
		const host = hosts.find((item) => item.email.toLowerCase() === query);
		return host
			? { error: "", host }
			: { error: t("booking.host.invalidEmail"), host: null };
	}
	const matches = hosts.filter(
		(item) =>
			item.name.toLowerCase() === query ||
			item.name.toLowerCase().startsWith(query)
	);
	if (matches.length === 1) {
		return { error: "", host: matches[0] };
	}
	return {
		error: matches.length
			? t("booking.host.multiple")
			: t("booking.host.notFound"),
		host: null,
	};
}

export function durationLabel(
	minutes: number,
	t: Translator = defaultTranslator
): string {
	if (minutes === 60) {
		return t("booking.duration.hour");
	}
	if (minutes > 60 && minutes % 60 === 0) {
		return t("booking.duration.hours", { count: minutes / 60 });
	}
	return t("booking.duration.min", { count: minutes });
}

export function availabilityLabel(
	event: BookingEvent,
	t: Translator = defaultTranslator
): string {
	const { weekdays } = formFromEvent(event);
	if (!weekdays.length) {
		return t("booking.noDays");
	}
	const days = weekdays
		.map((day) => t(`calendar.weekdayShort.${day}` as TranslationKey))
		.join(", ");
	const ranges = parseBookingTimeRanges(event.timeRanges, {
		endTime: event.endTime,
		startTime: event.startTime,
	});
	return `${days} · ${ranges.map((range) => `${range.startTime}–${range.endTime}`).join(", ")}`;
}

export function formAvailabilityLabel(
	form: BookingForm,
	t: Translator = defaultTranslator
): string {
	if (!form.weekdays.length) {
		return t("booking.noDays");
	}
	const days = form.weekdays
		.map((day) => t(`calendar.weekdayShort.${day}` as TranslationKey))
		.join(", ");
	return `${days} · ${form.timeRanges.length === 1 ? `${form.timeRanges[0].startTime}–${form.timeRanges[0].endTime}` : t("booking.timeWindows", { count: form.timeRanges.length })}`;
}

const formatBookingMinutes = (minutes: number) =>
	`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function nextBookingTimeRange(
	ranges: BookingTimeRange[],
	durationMinutes: number
): BookingTimeRange {
	const length = Math.ceil(Math.max(durationMinutes, 60) / 15) * 15;
	const occupied = ranges
		.map((range) => ({
			end: timeToMinutes(range.endTime),
			start: timeToMinutes(range.startTime),
		}))
		.toSorted((a, b) => a.start - b.start);
	let start = occupied.at(-1)?.end ?? 9 * 60;
	if (start + length > 23 * 60 + 45) {
		start = 0;
		for (const range of occupied) {
			if (start + length <= range.start) {
				break;
			}
			start = Math.max(start, range.end);
		}
	}
	const end = Math.min(start + length, 23 * 60 + 45);

	return {
		endTime: formatBookingMinutes(end),
		startTime: formatBookingMinutes(start),
	};
}
