import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/backups")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/backups/route");
				return invokeHandler(handler.GET, request, params);
			},
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/backups/route");
				return invokeHandler(handler.POST, request, params);
			},
			PUT: async ({ request, params }) => {
				const handler = await import("@/app/api/backups/route");
				return invokeHandler(handler.PUT, request, params);
			},
		},
	},
});
