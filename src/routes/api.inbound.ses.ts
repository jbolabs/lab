import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/inbound/ses")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/inbound/ses/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
