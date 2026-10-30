import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/settings/trash-retention")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/api/settings/trash-retention/route");
				return invokeHandler(handler.GET, request, params);
			},
			PATCH: async ({ request, params }) => {
				const handler =
					await import("@/app/api/settings/trash-retention/route");
				return invokeHandler(handler.PATCH, request, params);
			},
		},
	},
});
