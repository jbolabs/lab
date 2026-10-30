import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/shared-files/$id")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/shared-files/[id]/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
