import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/inbound/resend")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/inbound/resend/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
