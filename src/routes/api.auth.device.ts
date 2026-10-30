import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/auth/device")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler = await import("@/app/api/auth/device/route");
				return invokeHandler(handler.DELETE, request, params);
			},
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/auth/device/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
