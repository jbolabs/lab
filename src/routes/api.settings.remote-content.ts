import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/settings/remote-content")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/remote-content/route");
				return invokeHandler(handler.GET, request, params);
			},
			PATCH: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/remote-content/route");
				return invokeHandler(handler.PATCH, request, params);
			},
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/remote-content/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
