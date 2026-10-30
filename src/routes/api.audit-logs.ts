import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/audit-logs")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/audit-logs/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
