import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/mobile/push")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler = await import("@/app/api/mobile/push/route");
				return invokeHandler(handler.DELETE, request, params);
			},
			PUT: async ({ request, params }) => {
				const handler = await import("@/app/api/mobile/push/route");
				return invokeHandler(handler.PUT, request, params);
			},
		},
	},
});
