import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/webhooks/$id/test")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/webhooks/[id]/test/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
