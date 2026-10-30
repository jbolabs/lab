import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/booking/settings")({
	server: {
		handlers: {
			PATCH: async ({ request, params }) => {
				const handler = await import("@/app/api/booking/settings/route");
				return invokeHandler(handler.PATCH, request, params);
			},
		},
	},
});
