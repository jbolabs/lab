import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/oauth/authorize")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/oauth/authorize/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
