import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/auth/accounts")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/auth/accounts/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
