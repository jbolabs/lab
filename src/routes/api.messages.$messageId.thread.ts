import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/messages/$messageId/thread")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/api/messages/[messageId]/thread/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
