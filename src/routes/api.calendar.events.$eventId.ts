import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/calendar/events/$eventId")({
	server: {
		handlers: {
			DELETE: async ({ request, params }) => {
				const handler =
					await import("@/app/api/calendar/events/[eventId]/route");
				return invokeHandler(handler.DELETE, request, params);
			},
			PATCH: async ({ request, params }) => {
				const handler =
					await import("@/app/api/calendar/events/[eventId]/route");
				return invokeHandler(handler.PATCH, request, params);
			},
		},
	},
});
