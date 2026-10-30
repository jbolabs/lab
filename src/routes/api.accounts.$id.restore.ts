import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/accounts/$id/restore")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/accounts/[id]/restore/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
