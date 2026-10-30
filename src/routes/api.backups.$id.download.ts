import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/backups/$id/download")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/backups/[id]/download/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
