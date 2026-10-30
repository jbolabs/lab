import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/backups/restore")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/backups/restore/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
