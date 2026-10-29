import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import type { AppDatabase } from "@/db";
import { webhookDeliveries, webhooks } from "@/db/schema";
import { newId } from "@/lib/ids";

/** Exponential backoff, capped at one hour: 1m, 2m, 4m, 8m, 16m... */
export function getRetryDelaySeconds(attempt: number): number {
	return Math.min(60 * 2 ** Math.max(attempt - 1, 0), 3600);
}

export function parseWebhookEvents(events: string): string[] {
	try {
		const parsed = JSON.parse(events);
		return Array.isArray(parsed)
			? parsed.filter((e): e is string => typeof e === "string")
			: [];
	} catch {
		return [];
	}
}

type DeliveryRow = typeof webhookDeliveries.$inferSelect;

type PendingDelivery = Pick<
	DeliveryRow,
	"id" | "payload" | "eventType" | "attempts"
>;

async function createDelivery(
	db: AppDatabase,
	webhookId: string,
	eventType: string,
	payload: string
): Promise<PendingDelivery> {
	const id = newId("whd");
	await db.insert(webhookDeliveries).values({
		attempts: 0,
		eventType,
		id,
		payload,
		status: "pending",
		webhookId,
	});
	return { attempts: 0, eventType, id, payload };
}

async function signPayload(secret: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(body)
	);
	return [...new Uint8Array(sig)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

const MAX_RESPONSE_SNIPPET = 500;

async function readResponseSnippet(res: Response): Promise<string> {
	try {
		const text = await res.text();
		return text.trim().slice(0, MAX_RESPONSE_SNIPPET);
	} catch {
		return "";
	}
}

/** Retry work is carried on the existing outbound queue so no new binding is required. */
export interface WebhookRetryMessage {
	kind: "webhook.retry";
	deliveryId: string;
}

async function scheduleRetry(
	env: CloudflareEnv,
	deliveryId: string,
	delaySeconds: number
): Promise<void> {
	const message: WebhookRetryMessage = { deliveryId, kind: "webhook.retry" };
	try {
		await env.OUTBOUND_QUEUE.send(message, { delaySeconds });
	} catch (error) {
		console.error(`Failed to schedule webhook retry for ${deliveryId}`, error);
	}
}

type WebhookRow = typeof webhooks.$inferSelect;

export type WebhookDeliveryStatus =
	| "pending"
	| "delivered"
	| "failed"
	| "retrying"
	| "exhausted";

const REQUEST_TIMEOUT_MS = 10_000;

/** Runs one delivery attempt and records the outcome, scheduling a retry when it fails. */
async function attemptDelivery(
	env: CloudflareEnv,
	db: AppDatabase,
	hook: WebhookRow,
	delivery: PendingDelivery
): Promise<WebhookDeliveryStatus> {
	const attempts = delivery.attempts + 1;
	const startedAt = Date.now();
	const now = new Date();

	let responseStatus: number | null = null;
	let error: string | null = null;

	try {
		const signature = await signPayload(hook.secret, delivery.payload);
		const res = await fetch(hook.url, {
			body: delivery.payload,
			headers: {
				"Content-Type": "application/json",
				"X-Email-Platform-Attempt": String(attempts),
				"X-Email-Platform-Delivery": delivery.id,
				"X-Email-Platform-Event": delivery.eventType,
				"X-Email-Platform-Signature": signature,
			},
			method: "POST",
			redirect: "manual",
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		responseStatus = res.status;
		if (!res.ok) {
			error =
				(await readResponseSnippet(res)) ||
				`Endpoint responded with ${res.status}`;
		}
	} catch (error_) {
		error = error_ instanceof Error ? error_.message : "Request failed";
	}

	const durationMs = Date.now() - startedAt;
	const delivered = !error;
	const canRetry = !delivered && attempts < hook.maxAttempts;
	const status: WebhookDeliveryStatus = (() => {
		if (delivered) {
			return "delivered";
		}
		if (canRetry) {
			return "retrying";
		}
		return "exhausted";
	})();
	const nextRetryAt = canRetry
		? new Date(Date.now() + getRetryDelaySeconds(attempts) * 1000)
		: null;

	await db
		.update(webhookDeliveries)
		.set({
			attempts,
			durationMs,
			error: error ? error.slice(0, MAX_RESPONSE_SNIPPET) : null,
			lastAttemptAt: now,
			nextRetryAt,
			responseStatus,
			status,
		})
		.where(eq(webhookDeliveries.id, delivery.id));

	if (canRetry) {
		await scheduleRetry(env, delivery.id, getRetryDelaySeconds(attempts));
	}

	return status;
}

export type WebhookEventType =
	| "message.inbound"
	| "message.outbound"
	| "message.failed";

export async function dispatchWebhooks(
	env: CloudflareEnv,
	userId: string,
	eventType: WebhookEventType,
	payload: Record<string, unknown>
): Promise<void> {
	const db = getDb(env);
	const hooks = await db
		.select()
		.from(webhooks)
		.where(eq(webhooks.userId, userId));

	for (const hook of hooks) {
		if (!hook.enabled) {
			continue;
		}
		if (!parseWebhookEvents(hook.events).includes(eventType)) {
			continue;
		}

		try {
			const body = JSON.stringify({ data: payload, type: eventType });
			const delivery = await createDelivery(db, hook.id, eventType, body);
			await attemptDelivery(env, db, hook, delivery);
		} catch (error) {
			console.error(`Webhook dispatch failed for ${hook.id}`, error);
		}
	}
}

/**
 * Runs (or re-runs) a delivery. Used by the retry queue and by the manual retry button.
 * Returns null when the delivery or its webhook no longer exists.
 */
export async function runDelivery(
	env: CloudflareEnv,
	deliveryId: string,
	options?: { userId?: string }
): Promise<{ status: WebhookDeliveryStatus } | null> {
	const db = getDb(env);
	const [delivery] = await db
		.select()
		.from(webhookDeliveries)
		.where(eq(webhookDeliveries.id, deliveryId))
		.limit(1);
	if (!delivery) {
		return null;
	}

	const [hook] = await db
		.select()
		.from(webhooks)
		.where(eq(webhooks.id, delivery.webhookId))
		.limit(1);
	if (!hook) {
		return null;
	}
	if (options?.userId && hook.userId !== options.userId) {
		return null;
	}

	return { status: await attemptDelivery(env, db, hook, delivery) };
}

/** Queue consumer entry point for scheduled retries. */
export async function processWebhookRetry(
	env: CloudflareEnv,
	message: WebhookRetryMessage
): Promise<void> {
	await runDelivery(env, message.deliveryId);
}

/** Sends a synthetic event so an operator can verify an endpoint from the UI. */
export async function sendTestDelivery(
	env: CloudflareEnv,
	hook: WebhookRow
): Promise<{ deliveryId: string; status: WebhookDeliveryStatus }> {
	const db = getDb(env);
	const body = JSON.stringify({
		data: {
			from: "postmaster@example.com",
			messageId: "test",
			subject: "Lab test delivery",
			to: "inbox@example.com",
		},
		test: true,
		type: "message.inbound",
	});
	const delivery = await createDelivery(db, hook.id, "message.inbound", body);
	const status = await attemptDelivery(env, db, hook, delivery);
	return { deliveryId: delivery.id, status };
}

export const WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
	"message.inbound",
	"message.outbound",
	"message.failed",
];
