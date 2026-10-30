import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/admin/agent/models")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/admin/agent/models/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
