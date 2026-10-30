import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/drive/attachments/$id/content")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/api/drive/attachments/[id]/content/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
