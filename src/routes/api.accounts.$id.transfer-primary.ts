import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/accounts/$id/transfer-primary")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler =
					await import("@/app/api/accounts/[id]/transfer-primary/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
