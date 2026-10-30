import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { requireSessionUser } from "@/lib/api/auth";
import {
	getSessionFromToken,
	getSessionTokenFromRequestHeaders,
} from "@/lib/auth/session";
import { getEnv } from "@/lib/cloudflare";
import { newId } from "@/lib/ids";
import {
	getVapidPublicKey,
	hasValidPushKeys,
	isSupportedPushEndpoint,
} from "@/lib/push/server";

const subscriptionSchema = z.object({
	endpoint: z.string().url().max(4096),
	keys: z.object({
		auth: z.string().min(1).max(256),
		p256dh: z.string().min(1).max(512),
	}),
});

const deleteSchema = z.object({
	endpoint: z.string().url().max(4096),
});

export async function POST(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	if (!getVapidPublicKey(env)) {
		return Response.json(
			{ error: "Push notifications are not configured" },
			{ status: 503 }
		);
	}

	const parsed = subscriptionSchema.safeParse(
		await request.json().catch(() => null)
	);
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid push subscription" },
			{ status: 400 }
		);
	}
	if (
		!isSupportedPushEndpoint(parsed.data.endpoint) ||
		!hasValidPushKeys(parsed.data.keys)
	) {
		return Response.json(
			{ error: "Unsupported push subscription" },
			{ status: 400 }
		);
	}

	const session = await getSessionFromToken(
		env,
		getSessionTokenFromRequestHeaders(request)
	);
	if (!session || session.userId !== auth.user.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const now = new Date();
	await getDb(env)
		.insert(pushSubscriptions)
		.values({
			auth: parsed.data.keys.auth,
			createdAt: now,
			endpoint: parsed.data.endpoint,
			id: newId(),
			p256dh: parsed.data.keys.p256dh,
			sessionId: session.id,
			updatedAt: now,
			userId: auth.user.id,
		})
		.onConflictDoUpdate({
			set: {
				auth: parsed.data.keys.auth,
				p256dh: parsed.data.keys.p256dh,
				sessionId: session.id,
				updatedAt: now,
				userId: auth.user.id,
			},
			target: pushSubscriptions.endpoint,
		});

	return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid push subscription" },
			{ status: 400 }
		);
	}

	await getDb(env)
		.delete(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.userId, auth.user.id),
				eq(pushSubscriptions.endpoint, parsed.data.endpoint)
			)
		);
	return Response.json({ ok: true });
}
