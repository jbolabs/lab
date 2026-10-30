import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/v1/domains/$id/dns/setup")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler =
					await import("@/app/api/v1/domains/[id]/dns/setup/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
