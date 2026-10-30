import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute(
	"/api/messages/$messageId/attachments/$attachmentId"
)({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/api/messages/[messageId]/attachments/[attachmentId]/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
