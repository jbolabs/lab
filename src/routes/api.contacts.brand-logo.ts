import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/contacts/brand-logo")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/contacts/brand-logo/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
