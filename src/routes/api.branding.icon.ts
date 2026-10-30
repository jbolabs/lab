import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/branding/icon")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/branding/icon/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
