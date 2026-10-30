import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/oauth/approve")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/oauth/approve/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
