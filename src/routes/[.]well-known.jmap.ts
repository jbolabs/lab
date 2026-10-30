import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/.well-known/jmap")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/.well-known/jmap/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
