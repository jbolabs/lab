import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/v1/domains")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/v1/domains/route");
				return invokeHandler(handler.GET, request, params);
			},
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/v1/domains/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
