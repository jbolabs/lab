import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/templates/$id")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler = await import("@/app/api/templates/[id]/route");
				return invokeHandler(handler.DELETE, request, params);
			},
		},
	},
});
