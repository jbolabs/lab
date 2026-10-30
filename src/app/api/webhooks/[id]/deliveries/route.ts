import { desc, eq } from "drizzle-orm";

import { webhookDeliveries } from "@/db/schema";

import type { WebhookRouteParams } from "../types";
import { loadOwnedWebhook } from "../utils";

const MAX_PAYLOAD_PREVIEW = 2000;

export async function GET(request: Request, { params }: WebhookRouteParams) {
	const { id } = await params;
	const loaded = await loadOwnedWebhook(request, id);
	if (loaded.error) {
		return loaded.error;
	}

	const url = new URL(request.url);
	const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 100);
	const status = url.searchParams.get("status");

	const rows = await loaded.db
		.select()
		.from(webhookDeliveries)
		.where(eq(webhookDeliveries.webhookId, id))
		.orderBy(desc(webhookDeliveries.createdAt))
		.limit(Number.isFinite(limit) && limit > 0 ? limit : 25);

	const filtered = status ? rows.filter((row) => row.status === status) : rows;

	return Response.json({
		deliveries: filtered.map((row) => ({
			attempts: row.attempts,
			createdAt: row.createdAt,
			durationMs: row.durationMs,
			error: row.error,
			eventType: row.eventType,
			id: row.id,
			lastAttemptAt: row.lastAttemptAt,
			maxAttempts: loaded.hook.maxAttempts,
			nextRetryAt: row.nextRetryAt,
			payload: row.payload.slice(0, MAX_PAYLOAD_PREVIEW),
			responseStatus: row.responseStatus,
			status: row.status,
		})),
	});
}
