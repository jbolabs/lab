import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/drafts/$id/attachments")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/drafts/[id]/attachments/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
