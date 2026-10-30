import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/attachment-policy")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/attachment-policy/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
