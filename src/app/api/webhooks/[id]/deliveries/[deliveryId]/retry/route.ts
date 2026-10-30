import { runDelivery } from "@/lib/email/webhooks";

import type { WebhookDeliveryRouteParams } from "../../../types";
import { loadOwnedWebhook } from "../../../utils";

export async function POST(
	request: Request,
	{ params }: WebhookDeliveryRouteParams
) {
	const { id, deliveryId } = await params;
	const loaded = await loadOwnedWebhook(request, id);
	if (loaded.error) {
		return loaded.error;
	}

	const result = await runDelivery(loaded.env, deliveryId, {
		userId: loaded.user.id,
	});
	if (!result) {
		return Response.json({ error: "Delivery not found" }, { status: 404 });
	}

	return Response.json({ status: result.status });
}
