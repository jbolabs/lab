import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/.well-known/oauth-protected-resource/route");
				return invokeHandler(handler.GET, request, params);
			},
			OPTIONS: async ({ request, params }) => {
				const handler =
					await import("@/app/.well-known/oauth-protected-resource/route");
				return invokeHandler(handler.OPTIONS, request, params);
			},
		},
	},
});
