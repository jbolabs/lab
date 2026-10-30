import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/agent/conversations/$id")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler =
					await import("@/app/api/agent/conversations/[id]/route");
				return invokeHandler(handler.DELETE, request, params);
			},
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/api/agent/conversations/[id]/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
