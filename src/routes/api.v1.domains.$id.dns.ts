import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/v1/domains/$id/dns")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/v1/domains/[id]/dns/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
