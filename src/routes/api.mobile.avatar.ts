import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/mobile/avatar")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/mobile/avatar/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
