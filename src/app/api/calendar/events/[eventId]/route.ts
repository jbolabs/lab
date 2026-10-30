import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { calendarEvents } from "@/db/schema";
import {
	authorizeCalendarRequest,
	calendarKeyCanSendInvitations,
} from "@/lib/calendar/api-auth";
import { normalizeCalendarColor } from "@/lib/calendar/colors";
import {
	DEFAULT_REPEAT_DAYS,
	normalizeCalendarRepeat,
	normalizeCalendarRepeatDays,
	parseCalendarOccurrenceId,
	parseCalendarRepeatDays,
	parseExcludedOccurrences,
} from "@/lib/calendar/recurrence";
import { createCalendarInvitation } from "@/lib/calendar/utils";
import { getEnv } from "@/lib/cloudflare";
import { sendEmail } from "@/lib/email/send";
import { newId } from "@/lib/ids";
import { getRequestTimeZone, normalizeTimeZone } from "@/lib/time/utils";

import type { CalendarEventInput } from "../types";
import type { CalendarEventRouteParams } from "./types";

export async function PATCH(
	request: Request,
	{ params }: CalendarEventRouteParams
) {
	const env = getEnv();
	const { user, key, error } = await authorizeCalendarRequest(
		env,
		request,
		"calendar:write"
	);
	if (error) {
		return error;
	}
	const { eventId } = await params;
	const occurrence = parseCalendarOccurrenceId(eventId);
	const input = (await request.json()) as CalendarEventInput;
	const startsAt = new Date(input.startsAt);
	const endsAt = new Date(input.endsAt);
	const effectiveFrom = input.effectiveFrom
		? new Date(input.effectiveFrom)
		: occurrence?.startsAt;
	const hasInvalidEventTimes = () =>
		!input.title?.trim() ||
		Number.isNaN(startsAt.getTime()) ||
		Number.isNaN(endsAt.getTime()) ||
		endsAt <= startsAt;
	if (hasInvalidEventTimes()) {
		return Response.json(
			{ error: "Enter a title and valid event times" },
			{ status: 400 }
		);
	}
	if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) {
		return Response.json({ error: "Invalid repeat start" }, { status: 400 });
	}
	const db = getDb(env);
	const [existing] = await db
		.select()
		.from(calendarEvents)
		.where(
			and(
				eq(calendarEvents.id, occurrence?.seriesId ?? eventId),
				eq(calendarEvents.userId, user.id)
			)
		)
		.limit(1);
	if (!existing) {
		return Response.json({ error: "Event not found" }, { status: 404 });
	}
	const resolveTimeZone = () =>
		input.timeZone
			? normalizeTimeZone(input.timeZone)
			: (existing.timeZone ?? getRequestTimeZone(request, user.timeZone));
	const timeZone = resolveTimeZone();
	const isMissingOccurrence = () =>
		occurrence &&
		(existing.repeat === "none" ||
			occurrence.startsAt < existing.startsAt ||
			(existing.repeatUntil && occurrence.startsAt >= existing.repeatUntil));
	if (isMissingOccurrence()) {
		return Response.json({ error: "Occurrence not found" }, { status: 404 });
	}
	const hasNoFutureOccurrences = () =>
		existing.repeat !== "none" &&
		effectiveFrom &&
		existing.repeatUntil &&
		effectiveFrom >= existing.repeatUntil;
	if (hasNoFutureOccurrences()) {
		return Response.json(
			{ error: "No future occurrences remain" },
			{ status: 404 }
		);
	}
	const attendees = (input.attendees ?? [])
		.map((email) => email.trim())
		.filter((email) => /^\S+@\S+\.\S+$/u.test(email));
	const cannotSendInvitations = () =>
		attendees.length &&
		existing.mailboxId &&
		input.from &&
		!calendarKeyCanSendInvitations(key, existing.mailboxId);
	if (cannotSendInvitations()) {
		return Response.json(
			{
				error:
					"Sending invitations requires mail send permission for this mailbox",
			},
			{ status: 403 }
		);
	}
	const buildMovedOccurrence = (now: Date) => ({
		...existing,
		attendees: JSON.stringify(attendees),
		color: normalizeCalendarColor(input.color ?? existing.color),
		createdAt: now,
		description: input.description?.trim() ?? "",
		endsAt,
		excludedOccurrences: "[]",
		id: newId("evt"),
		location: input.location?.trim() ?? "",
		repeat: "none" as const,
		repeatAnchorDay: null,
		repeatDays: "[]",
		repeatUntil: null,
		startsAt,
		title: input.title.trim(),
		updatedAt: now,
	});
	const moveOccurrenceToPast = async () => {
		if (input.moveOccurrenceToPast) {
			if (!occurrence || existing.repeat === "none" || startsAt >= new Date()) {
				return Response.json(
					{ error: "Choose a past time for this occurrence" },
					{ status: 400 }
				);
			}
			const excluded = parseExcludedOccurrences(existing.excludedOccurrences);
			if (excluded.includes(occurrence.startsAt.getTime())) {
				return Response.json(
					{ error: "Occurrence already moved" },
					{ status: 409 }
				);
			}
			const now = new Date();
			const moved = buildMovedOccurrence(now);
			await db.insert(calendarEvents).values(moved);
			await db
				.update(calendarEvents)
				.set({
					excludedOccurrences: JSON.stringify([
						...excluded,
						occurrence.startsAt.getTime(),
					]),
					updatedAt: now,
				})
				.where(eq(calendarEvents.id, existing.id));
			const { from } = input;
			const { mailboxId } = existing;
			if (attendees.length && mailboxId && from) {
				const file = createCalendarInvitation({ ...moved, uid: moved.id });
				await Promise.all(
					attendees.map((to) =>
						sendEmail(env, {
							attachments: [
								{
									content: file,
									filename: "invite.ics",
									type: "text/calendar; charset=utf-8",
								},
							],
							from,
							mailboxId,
							subject: `Updated invitation: ${moved.title}`,
							text:
								moved.description ||
								`This event has been updated: ${moved.title}.`,
							to,
							userId: user.id,
						})
					)
				);
			}
			return Response.json({ ok: true });
		}
	};
	const response1 = await moveOccurrenceToPast();
	if (response1 !== undefined) {
		return response1;
	}
	const resolveRepeat = () =>
		normalizeCalendarRepeat(input.repeat ?? existing.repeat);
	const repeat = resolveRepeat();
	const resolveRepeatDays = () =>
		repeat === "weekdays"
			? normalizeCalendarRepeatDays(
					input.repeatDays ??
						(existing.repeat === "weekdays"
							? parseCalendarRepeatDays(existing.repeatDays)
							: DEFAULT_REPEAT_DAYS)
				)
			: [];
	const repeatDays = resolveRepeatDays();
	if (repeat === "weekdays" && repeatDays.length === 0) {
		return Response.json(
			{ error: "Choose at least one weekday" },
			{ status: 400 }
		);
	}
	const repeatAnchorDay = (() => {
		if (
			repeat === "monthly" &&
			typeof input.repeatAnchorDay === "number" &&
			Number.isInteger(input.repeatAnchorDay) &&
			input.repeatAnchorDay >= 1 &&
			input.repeatAnchorDay <= 31
		) {
			return input.repeatAnchorDay;
		}
		if (repeat === "monthly") {
			return existing.repeatAnchorDay;
		}
		return null;
	})();
	const buildUpdatedEvent = () => ({
		...existing,
		attendees: JSON.stringify(attendees),
		color: normalizeCalendarColor(input.color ?? existing.color),
		description: input.description?.trim() ?? "",
		endsAt,
		location: input.location?.trim() ?? "",
		repeat,
		repeatAnchorDay,
		repeatDays: JSON.stringify(repeatDays),
		repeatUntil: repeat === "none" ? null : existing.repeatUntil,
		startsAt,
		timeZone,
		title: input.title.trim(),
	});
	const event = buildUpdatedEvent();
	const splitAt = existing.repeat === "none" ? null : effectiveFrom;
	if (splitAt && splitAt > existing.startsAt) {
		const now = new Date();
		await db
			.insert(calendarEvents)
			.values({ ...event, createdAt: now, id: newId("evt"), updatedAt: now });
		await db
			.update(calendarEvents)
			.set({ repeatUntil: splitAt, updatedAt: now })
			.where(eq(calendarEvents.id, existing.id));
	} else {
		await db
			.update(calendarEvents)
			.set({
				attendees: event.attendees,
				color: event.color,
				description: event.description,
				endsAt,
				location: event.location,
				repeat: event.repeat,
				repeatAnchorDay: event.repeatAnchorDay,
				repeatDays: event.repeatDays,
				repeatUntil: event.repeatUntil,
				startsAt,
				timeZone,
				title: event.title,
				updatedAt: new Date(),
			})
			.where(eq(calendarEvents.id, existing.id));
	}
	const { from } = input;
	const { mailboxId } = existing;
	const sendUpdatedInvitations = async () => {
		if (attendees.length && mailboxId && from) {
			const file = createCalendarInvitation({ ...event, uid: existing.id });
			await Promise.all(
				attendees.map((to) =>
					sendEmail(env, {
						attachments: [
							{
								content: file,
								filename: "invite.ics",
								type: "text/calendar; charset=utf-8",
							},
						],
						from,
						mailboxId,
						subject: `Updated invitation: ${event.title}`,
						text:
							event.description ||
							`This event has been updated: ${event.title}.`,
						to,
						userId: user.id,
					})
				)
			);
		}
	};
	await sendUpdatedInvitations();
	return Response.json({ ok: true });
}

export async function DELETE(
	request: Request,
	{ params }: CalendarEventRouteParams
) {
	const env = getEnv();
	const { user, error } = await authorizeCalendarRequest(
		env,
		request,
		"calendar:write"
	);
	if (error) {
		return error;
	}
	const { eventId } = await params;
	const occurrence = parseCalendarOccurrenceId(eventId);
	const input = (await request.json().catch(() => ({}))) as CalendarEventInput;
	const effectiveFrom = input.effectiveFrom
		? new Date(input.effectiveFrom)
		: occurrence?.startsAt;
	if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) {
		return Response.json({ error: "Invalid repeat start" }, { status: 400 });
	}
	const db = getDb(env);
	const [existing] = await db
		.select()
		.from(calendarEvents)
		.where(
			and(
				eq(calendarEvents.id, occurrence?.seriesId ?? eventId),
				eq(calendarEvents.userId, user.id)
			)
		)
		.limit(1);
	if (!existing) {
		return Response.json({ error: "Event not found" }, { status: 404 });
	}
	if (
		occurrence &&
		(existing.repeat === "none" ||
			occurrence.startsAt < existing.startsAt ||
			(existing.repeatUntil && occurrence.startsAt >= existing.repeatUntil))
	) {
		return Response.json({ error: "Occurrence not found" }, { status: 404 });
	}
	await (existing.repeat !== "none" &&
	effectiveFrom &&
	effectiveFrom > existing.startsAt
		? db
				.update(calendarEvents)
				.set({ repeatUntil: effectiveFrom, updatedAt: new Date() })
				.where(eq(calendarEvents.id, existing.id))
		: db.delete(calendarEvents).where(eq(calendarEvents.id, existing.id)));
	return Response.json({ ok: true });
}
