import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/v1/accounts/$id")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/v1/accounts/[id]/route");
				return invokeHandler(handler.GET, request, params);
			},
			PATCH: async ({ request, params }) => {
				const handler = await import("@/app/api/v1/accounts/[id]/route");
				return invokeHandler(handler.PATCH, request, params);
			},
		},
	},
});
