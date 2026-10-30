import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/settings/shortcuts")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/shortcuts/route");
				return invokeHandler(handler.GET, request, params);
			},
			PATCH: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/shortcuts/route");
				return invokeHandler(handler.PATCH, request, params);
			},
		},
	},
});
