import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/backups/$id")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler = await import("@/app/api/backups/[id]/route");
				return invokeHandler(handler.DELETE, request, params);
			},
		},
	},
});
