import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/agent/approvals")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/agent/approvals/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
