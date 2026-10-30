import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/oauth/consent/page";
import { consent } from "@/lib/route-data";

export const Route = createFileRoute("/oauth/consent/")({
	component: Page,
	head: () => ({
		meta: [
			{ title: "Connect an assistant · The Lab" },
			{ content: "no-referrer", name: "referrer" },
		],
	}),
	loader: ({ deps }) => consent({ data: deps }),
	loaderDeps: ({ search }) => search,
	validateSearch: (search: Record<string, unknown>) =>
		Object.fromEntries(
			Object.entries(search)
				.filter(([, value]) =>
					["string", "number", "boolean"].includes(typeof value)
				)
				.map(([key, value]) => [key, String(value)])
		) as Record<string, string>,
});
