import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/auth/password-reset/request")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler =
					await import("@/app/api/auth/password-reset/request/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
