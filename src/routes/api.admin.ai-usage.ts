import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/admin/ai-usage")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/admin/ai-usage/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
