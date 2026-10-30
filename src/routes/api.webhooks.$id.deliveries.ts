import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/webhooks/$id/deliveries")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/api/webhooks/[id]/deliveries/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
