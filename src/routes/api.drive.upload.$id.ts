import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/drive/upload/$id")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler = await import("@/app/api/drive/upload/[id]/route");
				return invokeHandler(handler.DELETE, request, params);
			},
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/drive/upload/[id]/route");
				return invokeHandler(handler.POST, request, params);
			},
			PUT: async ({ request, params }) => {
				const handler = await import("@/app/api/drive/upload/[id]/route");
				return invokeHandler(handler.PUT, request, params);
			},
		},
	},
});
