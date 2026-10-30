import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/settings/forwarding")({
	server: {
		handlers: {
			PATCH: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/forwarding/route");
				return invokeHandler(handler.PATCH, request, params);
			},
		},
	},
});
