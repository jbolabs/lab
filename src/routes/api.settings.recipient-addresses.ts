import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/settings/recipient-addresses")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/api/settings/recipient-addresses/route");
				return invokeHandler(handler.GET, request, params);
			},
			PATCH: async ({ request, params }) => {
				const handler =
					await import("@/app/api/settings/recipient-addresses/route");
				return invokeHandler(handler.PATCH, request, params);
			},
		},
	},
});
