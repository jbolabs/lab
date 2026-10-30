import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { bookingEvents, users } from "@/db/schema";
import { getEnv } from "@/lib/cloudflare";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const username = url.searchParams.get("username");
	const userId = url.searchParams.get("userId");
	if (!username && !userId) {
		return Response.json({ error: "Missing booking page" }, { status: 400 });
	}
	const db = getDb(getEnv());
	const [user] = await db
		.select({ id: users.id, name: users.name, username: users.bookingUsername })
		.from(users)
		.where(
			and(
				username
					? eq(users.bookingUsername, username.toLowerCase())
					: eq(users.id, userId ?? ""),
				eq(users.disabled, false)
			)
		)
		.limit(1);
	if (!user) {
		return Response.json({ error: "Booking page not found" }, { status: 404 });
	}
	const events = await db
		.select({
			description: bookingEvents.description,
			durationMinutes: bookingEvents.durationMinutes,
			id: bookingEvents.id,
			location: bookingEvents.location,
			name: bookingEvents.name,
			slug: bookingEvents.slug,
			timeZone: bookingEvents.timeZone,
			weekdays: bookingEvents.weekdays,
		})
		.from(bookingEvents)
		.where(
			and(eq(bookingEvents.userId, user.id), eq(bookingEvents.enabled, true))
		)
		.orderBy(bookingEvents.createdAt);
	return Response.json({
		events,
		name: user.name,
		username: user.username,
	});
}
