import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/auth/password-reset/confirm")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler =
					await import("@/app/api/auth/password-reset/confirm/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
