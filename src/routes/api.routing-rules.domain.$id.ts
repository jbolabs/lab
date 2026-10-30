import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/routing-rules/domain/$id")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler =
					await import("@/app/api/routing-rules/domain/[id]/route");
				return invokeHandler(handler.DELETE, request, params);
			},
			PATCH: async ({ request, params }) => {
				const handler =
					await import("@/app/api/routing-rules/domain/[id]/route");
				return invokeHandler(handler.PATCH, request, params);
			},
		},
	},
});
