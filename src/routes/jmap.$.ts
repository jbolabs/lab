import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/jmap/$")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/jmap/[[...segments]]/route");
				return invokeHandler(handler.GET, request, params);
			},
			OPTIONS: async ({ request, params }) => {
				const handler = await import("@/app/jmap/[[...segments]]/route");
				return invokeHandler(handler.OPTIONS, request, params);
			},
			POST: async ({ request, params }) => {
				const handler = await import("@/app/jmap/[[...segments]]/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
