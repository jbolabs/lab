import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/settings/mfa/enroll")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/settings/mfa/enroll/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
