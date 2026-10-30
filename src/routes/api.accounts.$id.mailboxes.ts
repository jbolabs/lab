import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/accounts/$id/mailboxes")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/accounts/[id]/mailboxes/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
