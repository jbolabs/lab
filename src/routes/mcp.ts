import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/mcp")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler = await import("@/app/mcp/route");
				return invokeHandler(handler.DELETE, request, params);
			},
			GET: async ({ request, params }) => {
				const handler = await import("@/app/mcp/route");
				return invokeHandler(handler.GET, request, params);
			},
			POST: async ({ request, params }) => {
				const handler = await import("@/app/mcp/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
