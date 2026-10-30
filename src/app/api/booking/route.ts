import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { bookingEvents, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { validBookingHostIds } from "@/lib/booking/hosts";
import { ensureBookingUsername } from "@/lib/booking/username";
import { parseBookingEventInput } from "@/lib/booking/utils";
import { getEnv } from "@/lib/cloudflare";
import { newId } from "@/lib/ids";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const username = await ensureBookingUsername(env, user.id, user.email);
	const db = getDb(env);
	const events = await db
		.select()
		.from(bookingEvents)
		.where(eq(bookingEvents.userId, user.id))
		.orderBy(bookingEvents.createdAt);
	const [currentUser] = await db
		.select({ avatarKey: users.avatarKey })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);
	const canManageHosts = user.role === "admin";
	return Response.json({
		canManageHosts,
		currentUser: {
			email: user.email,
			hasAvatar: !!currentUser?.avatarKey,
			id: user.id,
			name: user.name,
		},
		events,
		username,
	});
}

export async function POST(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const input = parseBookingEventInput(await request.json().catch(() => null));
	if (!input) {
		return Response.json(
			{ error: "Enter valid booking details and availability." },
			{ status: 400 }
		);
	}
	const db = getDb(env);
	const canManageHosts = user.role === "admin";
	const hostIds = await validBookingHostIds(
		db,
		user.id,
		input.hostIds,
		canManageHosts
	);
	if (!hostIds) {
		return Response.json(
			{ error: "Choose users from the host list." },
			{ status: 400 }
		);
	}
	const [taken] = await db
		.select({ id: bookingEvents.id })
		.from(bookingEvents)
		.where(
			and(eq(bookingEvents.userId, user.id), eq(bookingEvents.slug, input.slug))
		)
		.limit(1);
	if (taken) {
		return Response.json(
			{ error: "This event link is already in use." },
			{ status: 409 }
		);
	}
	try {
		const [event] = await db
			.insert(bookingEvents)
			.values({
				...input,
				hostIds: JSON.stringify(hostIds),
				id: newId("book"),
				timeRanges: JSON.stringify(input.timeRanges),
				userId: user.id,
				weekdays: JSON.stringify(input.weekdays),
			})
			.returning();
		return Response.json({ event });
	} catch (error) {
		if (
			error instanceof Error &&
			/UNIQUE constraint failed|booking_events_user_slug_idx/iu.test(
				error.message
			)
		) {
			return Response.json(
				{ error: "This event link is already in use." },
				{ status: 409 }
			);
		}
		throw error;
	}
}
