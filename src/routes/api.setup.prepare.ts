import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/setup/prepare")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/setup/prepare/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
