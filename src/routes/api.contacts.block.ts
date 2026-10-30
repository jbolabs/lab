import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/contacts/block")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/contacts/block/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
