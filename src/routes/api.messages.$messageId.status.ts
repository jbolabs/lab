import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/messages/$messageId/status")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler =
					await import("@/app/api/messages/[messageId]/status/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
