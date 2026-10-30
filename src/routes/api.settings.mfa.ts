import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/settings/mfa")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/mfa/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
