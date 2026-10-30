import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/settings/password")({
	server: {
		handlers: {
			PATCH: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/password/route");
				return invokeHandler(handler.PATCH, request, params);
			},
		},
	},
});
