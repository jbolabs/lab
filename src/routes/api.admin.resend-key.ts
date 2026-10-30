import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/admin/resend-key")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler = await import("@/app/api/admin/resend-key/route");
				return invokeHandler(handler.DELETE, request, params);
			},
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/admin/resend-key/route");
				return invokeHandler(handler.GET, request, params);
			},
			PUT: async ({ request, params }) => {
				const handler = await import("@/app/api/admin/resend-key/route");
				return invokeHandler(handler.PUT, request, params);
			},
		},
	},
});
