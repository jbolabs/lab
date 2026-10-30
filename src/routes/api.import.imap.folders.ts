import { createFileRoute } from "@tanstack/react-router";

import { invokeHandler } from "@/lib/http/handler";

export const Route = createFileRoute("/api/import/imap/folders")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const handler = await import("@/app/api/import/imap/folders/route");
				return invokeHandler(handler.POST, request, params);
			},
		},
	},
});
