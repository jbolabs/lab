import { eq } from "drizzle-orm";

import { webhooks } from "@/db/schema";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { parseWebhookEvents } from "@/lib/email/webhooks";
import { newId } from "@/lib/ids";
import { webhookUpdateSchema } from "@/lib/validators";

import type { WebhookRouteParams } from "./types";
import { loadOwnedWebhook } from "./utils";

export async function GET(request: Request, { params }: WebhookRouteParams) {
	const { id } = await params;
	const loaded = await loadOwnedWebhook(request, id);
	if (loaded.error) {
		return loaded.error;
	}

	const { hook } = loaded;
	return Response.json({
		webhook: {
			createdAt: hook.createdAt,
			description: hook.description,
			enabled: hook.enabled,
			events: parseWebhookEvents(hook.events),
			id: hook.id,
			maxAttempts: hook.maxAttempts,
			url: hook.url,
		},
	});
}

export async function PATCH(request: Request, { params }: WebhookRouteParams) {
	const { id } = await params;
	const loaded = await loadOwnedWebhook(request, id);
	if (loaded.error) {
		return loaded.error;
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}

	const parsed = webhookUpdateSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const updates: Partial<typeof webhooks.$inferInsert> = {};
	if (parsed.data.url !== undefined) {
		updates.url = parsed.data.url;
	}
	if (parsed.data.description !== undefined) {
		updates.description = parsed.data.description?.trim() || null;
	}
	if (parsed.data.events !== undefined) {
		updates.events = JSON.stringify(parsed.data.events);
	}
	if (parsed.data.enabled !== undefined) {
		updates.enabled = parsed.data.enabled;
	}
	if (parsed.data.maxAttempts !== undefined) {
		updates.maxAttempts = parsed.data.maxAttempts;
	}
	const secret = parsed.data.rotateSecret ? newId("whsec") : null;
	if (secret) {
		updates.secret = secret;
	}

	if (Object.keys(updates).length === 0) {
		return Response.json({ error: "No changes provided" }, { status: 400 });
	}

	await loaded.db.update(webhooks).set(updates).where(eq(webhooks.id, id));
	return Response.json({ ok: true, ...(secret ? { secret } : {}) });
}

export async function DELETE(request: Request, { params }: WebhookRouteParams) {
	const { id } = await params;
	const loaded = await loadOwnedWebhook(request, id);
	if (loaded.error) {
		return loaded.error;
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}

	// Deliveries cascade with the webhook row.
	await loaded.db.delete(webhooks).where(eq(webhooks.id, id));
	return Response.json({ ok: true });
}
