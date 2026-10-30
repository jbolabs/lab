import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/settings/profile")({
	server: {
		handlers: {
			PATCH: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/profile/route");
				return invokeHandler(handler.PATCH, request, params);
			},
		},
	},
});
