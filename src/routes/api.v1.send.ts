import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/v1/send")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/v1/send/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
