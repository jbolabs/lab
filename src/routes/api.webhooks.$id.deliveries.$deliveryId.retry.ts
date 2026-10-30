import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute(
	"/api/webhooks/$id/deliveries/$deliveryId/retry"
)({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler =
					await import("@/app/api/webhooks/[id]/deliveries/[deliveryId]/retry/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
