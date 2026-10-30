import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/messages/$messageId/original")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/api/messages/[messageId]/original/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
