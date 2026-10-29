import { count, desc, eq, max } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { webhookDeliveries, webhooks } from "@/db/schema";
import { requireSessionUser } from "@/lib/api/auth";
import { isPrimaryAdmin } from "@/lib/auth/admin";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import { parseWebhookEvents } from "@/lib/email/webhooks";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { readJsonBody } from "@/lib/http/request";
import { newId } from "@/lib/ids";
import { webhookSchema } from "@/lib/validators";

import { summariseDeliveryStats } from "./utils";

export async function GET(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	const { user } = auth;
	if (!isPrimaryAdmin(user)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	const db = getDb(env);
	const rows = await db
		.select()
		.from(webhooks)
		.where(eq(webhooks.userId, user.id))
		.orderBy(desc(webhooks.createdAt));

	// One grouped query gives every endpoint its delivery health without an N+1.
	const stats = await db
		.select({
			lastAttemptAt: max(webhookDeliveries.lastAttemptAt),
			status: webhookDeliveries.status,
			total: count(),
			webhookId: webhookDeliveries.webhookId,
		})
		.from(webhookDeliveries)
		.groupBy(webhookDeliveries.webhookId, webhookDeliveries.status);

	return NextResponse.json({
		webhooks: rows.map((w) => ({
			createdAt: w.createdAt,
			description: w.description,
			enabled: w.enabled,
			events: parseWebhookEvents(w.events),
			id: w.id,
			maxAttempts: w.maxAttempts,
			stats: summariseDeliveryStats(stats, w.id),
			url: w.url,
		})),
	});
}

export async function POST(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	const { user } = auth;
	if (!isPrimaryAdmin(user)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
	}
	let body: unknown;
	try {
		body = await readJsonBody(request, 16 * 1024);
	} catch (error) {
		const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
		return NextResponse.json({ error: "Invalid webhook request" }, { status });
	}
	const parsed = webhookSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	const secret = newId("whsec");
	const db = getDb(env);
	const id = newId("wh");
	await db.insert(webhooks).values({
		description: parsed.data.description?.trim() || null,
		enabled: true,
		events: JSON.stringify(parsed.data.events),
		id,
		maxAttempts: parsed.data.maxAttempts,
		secret,
		url: parsed.data.url,
		userId: user.id,
	});

	// The signing secret is shown once, at creation time, and never returned again.
	return NextResponse.json({
		events: parsed.data.events,
		id,
		secret,
		url: parsed.data.url,
	});
}
