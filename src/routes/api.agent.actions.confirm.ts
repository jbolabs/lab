import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/agent/actions/confirm")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/agent/actions/confirm/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
