import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/drive/documents/$id")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/drive/documents/[id]/route");
				return invokeHandler(handler.GET, request, params);
			},
			PUT: async ({ request, params }) => {
				const handler = await import("@/app/api/drive/documents/[id]/route");
				return invokeHandler(handler.PUT, request, params);
			},
		},
	},
});
