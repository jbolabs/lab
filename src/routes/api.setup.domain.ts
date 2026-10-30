import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/setup/domain")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/setup/domain/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
