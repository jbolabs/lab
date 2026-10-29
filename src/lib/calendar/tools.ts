import { and, eq, gte, lt, ne, or } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { calendarEvents } from "@/db/schema";
import { toolEmailSchema } from "@/lib/agent/schema-utils";
import { newId } from "@/lib/ids";
import { normalizeTimeZone, zonedDateFields } from "@/lib/time/utils";

import { normalizeCalendarColor } from "./colors";
import {
	DEFAULT_REPEAT_DAYS,
	normalizeCalendarRepeatDays,
	parseCalendarOccurrenceId,
} from "./recurrence";
import { expandToolEvents } from "./tool-occurrences";
import type { CalendarToolContext, CalendarToolName } from "./tool-types";

const id = z.string().min(1).max(160);
const instant = z.string().datetime({ offset: true });
const range = { end: instant, start: instant };
const repeat = z.enum(["none", "daily", "weekly", "monthly", "weekdays"]);
const fields = {
	attendees: z.array(toolEmailSchema).max(50),
	color: z.string().max(30),
	description: z.string().max(10_000),
	endsAt: instant,
	location: z.string().max(500),
	repeat,
	repeatDays: z.array(z.number().int().min(0).max(6)).max(7),
	startsAt: instant,
	timeZone: z.string().max(80),
	title: z.string().trim().min(1).max(500),
};
const update = z.object({
	attendees: fields.attendees.optional(),
	color: fields.color.optional(),
	description: fields.description.optional(),
	endsAt: instant.optional(),
	eventId: id,
	location: fields.location.optional(),
	repeat: repeat.optional(),
	repeatDays: fields.repeatDays.optional(),
	startsAt: instant.optional(),
	timeZone: fields.timeZone.optional(),
	title: fields.title.optional(),
});

export const calendarToolSchemas = {
	create_event: z.object({
		attendees: fields.attendees.optional(),
		color: fields.color.optional(),
		description: fields.description.optional(),
		endsAt: instant,
		location: fields.location.optional(),
		repeat: repeat.default("none"),
		repeatDays: fields.repeatDays.optional(),
		startsAt: instant,
		timeZone: fields.timeZone.optional(),
		title: fields.title,
	}),
	delete_events: z.object({ eventIds: z.array(id).min(1).max(20) }),
	find_free_time: z.object({
		...range,
		durationMinutes: z.number().int().min(5).max(1440),
		limit: z.number().int().min(1).max(30).default(10),
	}),
	get_calendars: z.object({}),
	get_event: z.object({ eventId: id }),
	get_schedule: z.object({ ...range }),
	search_events: z.object({
		query: z.string().trim().min(1).max(300),
		...range,
		limit: z.number().int().min(1).max(100).default(50),
	}),
	update_events: z.object({ updates: z.array(update).min(1).max(20) }),
} as const;

export const calendarToolDescriptions: Record<CalendarToolName, string> = {
	create_event:
		"Create an event in the user's personal calendar. This saves immediately; attendees are recorded but invitations are not sent.",
	delete_events:
		"Delete up to 20 owned event series by series ID. This saves immediately and does not send cancellations.",
	find_free_time:
		"Find available slots using the user's events in an ISO 8601 time range, up to 90 days. Returns UTC instants.",
	get_calendars:
		"List the calendars available here. The Lab currently has one personal calendar per user.",
	get_event:
		"Get an event or recurring occurrence by ID. Returns its series ID for edits.",
	get_schedule:
		"List the user's calendar events and recurring occurrences in an ISO 8601 time range, up to 90 days.",
	search_events:
		"Search event title, description, and location in an ISO 8601 time range, up to 90 days.",
	update_events:
		"Update up to 20 owned event series by series ID. Changes apply to the whole series and save immediately; invitations are not sent.",
};

export const CALENDAR_TOOL_NAMES = Object.keys(
	calendarToolSchemas
) as CalendarToolName[];
export const calendarToolScope = (name: CalendarToolName) =>
	name === "create_event" ||
	name === "update_events" ||
	name === "delete_events"
		? "mcp:calendar-write"
		: "mcp:calendar-read";

function dates(start: string, end: string) {
	const from = new Date(start);
	const to = new Date(end);
	if (to <= from || to.getTime() - from.getTime() > 90 * 86_400_000) {
		throw new Error("Choose a positive range of at most 90 days");
	}
	return { from, to };
}

function eventsInRange(context: CalendarToolContext, from: Date, to: Date) {
	return getDb(context.env)
		.select()
		.from(calendarEvents)
		.where(
			and(
				eq(calendarEvents.userId, context.user.id),
				lt(calendarEvents.startsAt, to),
				or(gte(calendarEvents.endsAt, from), ne(calendarEvents.repeat, "none"))
			)
		);
}

function listCalendars(context: CalendarToolContext): unknown {
	return {
		calendars: [
			{
				id: "personal",
				name: "Personal calendar",
				timeZone: normalizeTimeZone(context.user.timeZone),
				writable: true,
			},
		],
	};
}

async function queryCalendar(
	context: CalendarToolContext,
	input: Record<string, unknown>,
	name: CalendarToolName
): Promise<unknown> {
	const { from, to } = dates(input.start as string, input.end as string);
	const events = expandToolEvents(
		await eventsInRange(context, from, to),
		from,
		to
	);
	if (name === "get_schedule") {
		return { events, truncated: events.length >= 500 };
	}
	if (name === "search_events") {
		const query = (input.query as string).toLocaleLowerCase();
		const matches = events.filter((event) =>
			[event.title, event.description, event.location].some((value) =>
				value.toLocaleLowerCase().includes(query)
			)
		);
		return {
			events: matches.slice(0, input.limit as number),
			truncated:
				events.length >= 500 || matches.length > (input.limit as number),
		};
	}
	const duration = (input.durationMinutes as number) * 60_000;
	const busy = events
		.map((event) => ({
			end: Math.min(to.getTime(), Date.parse(event.endsAt)),
			start: Math.max(from.getTime(), Date.parse(event.startsAt)),
		}))
		.toSorted((a, b) => a.start - b.start);
	const slots: { startsAt: string; endsAt: string }[] = [];
	let cursor = from.getTime();
	for (const block of [...busy, { end: to.getTime(), start: to.getTime() }]) {
		if (block.start - cursor >= duration) {
			slots.push({
				endsAt: new Date(block.start).toISOString(),
				startsAt: new Date(cursor).toISOString(),
			});
		}
		cursor = Math.max(cursor, block.end);
		if (slots.length >= (input.limit as number)) {
			break;
		}
	}
	return { slots, truncated: events.length >= 500 };
}

async function getCalendarEvent(
	context: CalendarToolContext,
	input: Record<string, unknown>
): Promise<unknown> {
	const db = getDb(context.env);
	const occurrence = parseCalendarOccurrenceId(input.eventId as string);
	const [event] = await db
		.select()
		.from(calendarEvents)
		.where(
			and(
				eq(calendarEvents.userId, context.user.id),
				eq(calendarEvents.id, occurrence?.seriesId ?? (input.eventId as string))
			)
		)
		.limit(1);
	if (!event) {
		throw new Error("Event not found");
	}
	if (!occurrence) {
		return { event };
	}
	const found = expandToolEvents(
		[event],
		occurrence.startsAt,
		new Date(occurrence.startsAt.getTime() + 1)
	).find((item) => item.id === input.eventId);
	if (!found) {
		throw new Error("Occurrence not found");
	}
	return { event: found };
}

async function createCalendarEvent(
	context: CalendarToolContext,
	input: Record<string, unknown>
): Promise<unknown> {
	const db = getDb(context.env);
	const startsAt = new Date(input.startsAt as string);
	const endsAt = new Date(input.endsAt as string);
	if (endsAt <= startsAt) {
		throw new Error("Event end must be after its start");
	}
	const timeZone = normalizeTimeZone(
		(input.timeZone as string) ?? context.timeZone ?? context.user.timeZone
	);
	const repeatDays = normalizeCalendarRepeatDays(
		input.repeatDays ?? DEFAULT_REPEAT_DAYS
	);
	if (input.repeat === "weekdays" && !repeatDays.length) {
		throw new Error("Choose at least one weekday");
	}
	const event = {
		attendees: JSON.stringify(input.attendees ?? []),
		color: normalizeCalendarColor(input.color as string | undefined),
		description: (input.description as string) ?? "",
		endsAt,
		id: newId("evt"),
		location: (input.location as string) ?? "",
		repeat: input.repeat as
			| "none"
			| "daily"
			| "weekly"
			| "monthly"
			| "weekdays",
		repeatAnchorDay:
			input.repeat === "monthly"
				? zonedDateFields(startsAt, timeZone).getUTCDate()
				: null,
		repeatDays: JSON.stringify(repeatDays),
		startsAt,
		timeZone,
		title: input.title as string,
		userId: context.user.id,
	};
	await db.insert(calendarEvents).values(event);
	return { eventId: event.id, status: "created" };
}

function calendarUpdateFields(
	item: z.infer<typeof update>,
	row: typeof calendarEvents.$inferSelect
) {
	const startsAt = item.startsAt ? new Date(item.startsAt) : row.startsAt;
	const endsAt = item.endsAt ? new Date(item.endsAt) : row.endsAt;
	const timeZone = item.timeZone
		? normalizeTimeZone(item.timeZone)
		: normalizeTimeZone(row.timeZone);
	return {
		attendees: item.attendees ? JSON.stringify(item.attendees) : row.attendees,
		color: item.color ? normalizeCalendarColor(item.color) : row.color,
		description: item.description ?? row.description,
		endsAt,
		location: item.location ?? row.location,
		repeat: item.repeat ?? row.repeat,
		repeatAnchorDay:
			(item.repeat ?? row.repeat) === "monthly"
				? zonedDateFields(startsAt, timeZone).getUTCDate()
				: null,
		repeatDays: item.repeatDays
			? JSON.stringify(normalizeCalendarRepeatDays(item.repeatDays))
			: row.repeatDays,
		startsAt,
		timeZone,
		title: item.title ?? row.title,
		updatedAt: new Date(),
	};
}

async function updateCalendarEvents(
	context: CalendarToolContext,
	input: Record<string, unknown>
): Promise<unknown> {
	const db = getDb(context.env);
	const updates = input.updates as z.infer<typeof update>[];
	const ids = updates.map((item) => item.eventId);
	if (
		new Set(ids).size !== ids.length ||
		ids.some((value) => parseCalendarOccurrenceId(value))
	) {
		throw new Error("Use unique series IDs for updates");
	}
	const existing = await Promise.all(
		ids.map(async (eventId) => {
			const rows = await db
				.select()
				.from(calendarEvents)
				.where(
					and(
						eq(calendarEvents.id, eventId),
						eq(calendarEvents.userId, context.user.id)
					)
				)
				.limit(1);
			return rows[0];
		})
	);
	if (existing.some((row) => !row)) {
		throw new Error("Event not found");
	}
	for (const [index, item] of updates.entries()) {
		const row = existing[index];
		if (!row) {
			throw new Error("Event not found");
		}
		if (
			(item.endsAt ? new Date(item.endsAt) : row.endsAt) <=
			(item.startsAt ? new Date(item.startsAt) : row.startsAt)
		) {
			throw new Error("Event end must be after its start");
		}
		if (
			(item.repeat ?? row.repeat) === "weekdays" &&
			!normalizeCalendarRepeatDays(
				item.repeatDays ?? JSON.parse(row.repeatDays)
			).length
		) {
			throw new Error("Choose at least one weekday");
		}
	}
	for (const [index, item] of updates.entries()) {
		const row = existing[index];
		if (!row) {
			throw new Error("Event not found");
		}

		await db
			.update(calendarEvents)
			.set(calendarUpdateFields(item, row))
			.where(
				and(
					eq(calendarEvents.id, row.id),
					eq(calendarEvents.userId, context.user.id)
				)
			);
	}
	return { eventIds: ids, status: "updated" };
}

function rejectOccurrenceIds(): never {
	throw new Error("Use unique series IDs for deletion");
}

function rejectMissingEvent(): never {
	throw new Error("Event not found");
}

export async function runCalendarTool(
	context: CalendarToolContext,
	name: CalendarToolName,
	rawInput: unknown
): Promise<unknown> {
	const input = calendarToolSchemas[name].parse(rawInput) as Record<
		string,
		unknown
	>;
	const db = getDb(context.env);
	if (name === "get_calendars") {
		return listCalendars(context);
	}
	if (
		name === "get_schedule" ||
		name === "search_events" ||
		name === "find_free_time"
	) {
		return queryCalendar(context, input, name);
	}
	if (name === "get_event") {
		return getCalendarEvent(context, input);
	}
	if (name === "create_event") {
		return createCalendarEvent(context, input);
	}
	if (name === "update_events") {
		return updateCalendarEvents(context, input);
	}
	const ids = input.eventIds as string[];
	if (
		new Set(ids).size !== ids.length ||
		ids.some((value) => parseCalendarOccurrenceId(value))
	) {
		return rejectOccurrenceIds();
	}
	const existing = await Promise.all(
		ids.map(async (eventId) => {
			const rows = await db
				.select({ id: calendarEvents.id })
				.from(calendarEvents)
				.where(
					and(
						eq(calendarEvents.id, eventId),
						eq(calendarEvents.userId, context.user.id)
					)
				)
				.limit(1);
			return rows[0];
		})
	);
	if (existing.some((row) => !row)) {
		return rejectMissingEvent();
	}
	for (const eventId of ids) {
		await db
			.delete(calendarEvents)
			.where(
				and(
					eq(calendarEvents.id, eventId),
					eq(calendarEvents.userId, context.user.id)
				)
			);
	}
	return { eventIds: ids, status: "deleted" };
}
