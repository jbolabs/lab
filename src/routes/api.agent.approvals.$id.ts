import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/agent/approvals/$id")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/agent/approvals/[id]/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
