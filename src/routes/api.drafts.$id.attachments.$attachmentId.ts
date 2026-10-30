import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute(
	"/api/drafts/$id/attachments/$attachmentId"
)({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler =
					await import("@/app/api/drafts/[id]/attachments/[attachmentId]/route");
				return invokeHandler(handler.DELETE, request, params);
			},
		},
	},
});
