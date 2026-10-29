import { authFetch } from "@/lib/auth/client";
import type { TranslationKey } from "@/lib/i18n/types";
import { defaultTranslator } from "@/lib/i18n/utils";
import { formatUserDate } from "@/lib/time/utils";

import type {
	CreateWebhookInput,
	UpdateWebhookInput,
	Webhook,
	WebhookDelivery,
	WebhookEvent,
} from "./types";

export const WEBHOOK_EVENTS: {
	value: WebhookEvent;
	labelKey: TranslationKey;
	hintKey: TranslationKey;
}[] = [
	{
		hintKey: "webhooks.event.inboundHint",
		labelKey: "webhooks.event.inbound",
		value: "message.inbound",
	},
	{
		hintKey: "webhooks.event.outboundHint",
		labelKey: "webhooks.event.outbound",
		value: "message.outbound",
	},
	{
		hintKey: "webhooks.event.failedHint",
		labelKey: "webhooks.event.failed",
		value: "message.failed",
	},
];

export const DELIVERY_STATUS_LABELS = {
	delivered: "webhooks.status.delivered",
	exhausted: "webhooks.status.exhausted",
	failed: "webhooks.status.failed",
	pending: "webhooks.status.pending",
	retrying: "webhooks.status.retrying",
} as const satisfies Record<string, TranslationKey>;

export const DELIVERY_STATUS_BADGE = {
	delivered: "success",
	exhausted: "destructive-soft",
	failed: "destructive-soft",
	pending: "secondary",
	retrying: "warning",
} as const satisfies Record<
	WebhookDelivery["status"],
	"success" | "destructive-soft" | "warning" | "secondary"
>;

async function readJson<T>(res: Response): Promise<T> {
	const json = (await res.json()) as T & { error?: unknown };
	if (!res.ok) {
		throw new Error(
			typeof json.error === "string"
				? json.error
				: defaultTranslator("domains.requestFailed")
		);
	}
	return json;
}

export async function fetchWebhooks(): Promise<Webhook[]> {
	const json = await readJson<{ webhooks: Webhook[] }>(
		await authFetch("/api/webhooks")
	);
	return json.webhooks ?? [];
}

export async function fetchDeliveries(
	webhookId: string
): Promise<WebhookDelivery[]> {
	const json = await readJson<{ deliveries: WebhookDelivery[] }>(
		await authFetch(`/api/webhooks/${webhookId}/deliveries?limit=50`)
	);
	return json.deliveries ?? [];
}

export async function createWebhook(input: CreateWebhookInput) {
	return readJson<{ id: string; secret: string }>(
		await authFetch("/api/webhooks", {
			body: JSON.stringify(input),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		})
	);
}

export async function updateWebhook(id: string, input: UpdateWebhookInput) {
	return readJson<{ ok: boolean; secret?: string }>(
		await authFetch(`/api/webhooks/${id}`, {
			body: JSON.stringify(input),
			headers: { "Content-Type": "application/json" },
			method: "PATCH",
		})
	);
}

export async function deleteWebhook(id: string) {
	return readJson(await authFetch(`/api/webhooks/${id}`, { method: "DELETE" }));
}

export async function testWebhook(id: string) {
	return readJson<{ deliveryId: string; status: string }>(
		await authFetch(`/api/webhooks/${id}/test`, { method: "POST" })
	);
}

export async function retryDelivery(webhookId: string, deliveryId: string) {
	return readJson<{ status: string }>(
		await authFetch(
			`/api/webhooks/${webhookId}/deliveries/${deliveryId}/retry`,
			{
				method: "POST",
			}
		)
	);
}

/** Drizzle timestamps arrive as epoch seconds when they bypass the column mapper. */
export function formatTimestamp(
	value: string | number | null | undefined
): string {
	if (value === null || value === undefined) {
		return "—";
	}
	const numeric = typeof value === "number" ? value : Date.parse(String(value));
	if (!Number.isFinite(numeric)) {
		return "—";
	}
	const ms = numeric < 1e12 ? numeric * 1000 : numeric;
	return formatUserDate(new Date(ms), {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

export function formatDuration(ms: number | null): string {
	if (ms === null || ms === undefined) {
		return "—";
	}
	return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function isRetryable(delivery: WebhookDelivery): boolean {
	return delivery.status !== "delivered";
}
