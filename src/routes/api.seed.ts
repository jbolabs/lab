import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/seed")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/seed/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
