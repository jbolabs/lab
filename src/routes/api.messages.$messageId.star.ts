import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/messages/$messageId/star")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler =
					await import("@/app/api/messages/[messageId]/star/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
