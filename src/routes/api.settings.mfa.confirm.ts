import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/settings/mfa/confirm")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/mfa/confirm/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
