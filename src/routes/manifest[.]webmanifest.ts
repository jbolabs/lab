import { createFileRoute } from "@tanstack/react-router";

import manifest from "@/app/manifest";

export const Route = createFileRoute("/manifest.webmanifest")({
	server: {
		handlers: {
			GET: () =>
				Response.json(manifest(), {
					headers: { "Content-Type": "application/manifest+json" },
				}),
		},
	},
});
