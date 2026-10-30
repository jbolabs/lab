import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/drive/owners/$id/avatar")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const handler =
					await import("@/app/api/drive/owners/[id]/avatar/route");
				return invokeHandler(handler.GET, request, params);
			},
		},
	},
});
