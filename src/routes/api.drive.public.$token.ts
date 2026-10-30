import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/drive/public/$token")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler = await import("@/app/api/drive/public/[token]/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
