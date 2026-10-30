import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/drive/items/$id/link")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/drive/items/[id]/link/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
