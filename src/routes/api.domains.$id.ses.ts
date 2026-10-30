import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/domains/$id/ses")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/domains/[id]/ses/route");
				return invokeHandler(handler.GET, request, params);
			},
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/domains/[id]/ses/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
