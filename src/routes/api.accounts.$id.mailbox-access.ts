import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/accounts/$id/mailbox-access")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler =
					await import("@/app/api/accounts/[id]/mailbox-access/route");
				return invokeHandler(handler.DELETE, request, params);
			},
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/api/accounts/[id]/mailbox-access/route");
				return invokeHandler(handler.GET, request, params);
			},
			POST: async ({ request, params }) => {
				const handler =
					await import("@/app/api/accounts/[id]/mailbox-access/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
