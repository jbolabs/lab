import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/admin/general")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/admin/general/route");
				return invokeHandler(handler.GET, request, params);
			},
			PUT: async ({ request, params }) => {
				const handler = await import("@/app/api/admin/general/route");
				return invokeHandler(handler.PUT, request, params);
			},
		},
	},
});
