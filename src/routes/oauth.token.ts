import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/oauth/token")({
	server: {
		handlers: {
			OPTIONS: async ({ request, params }) => {
				const handler = await import("@/app/oauth/token/route");
				return invokeHandler(handler.OPTIONS, request, params);
			},
			POST: async ({ request, params }) => {
				const handler = await import("@/app/oauth/token/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
