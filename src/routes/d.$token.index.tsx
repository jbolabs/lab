import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/d/[token]/page";
import { publicShareMeta } from "@/app/d/[token]/utils";
import { publicShare } from "@/lib/route-data";

export const Route = createFileRoute("/d/$token/")({
	component: Page,
	head: ({ loaderData, params }) => ({
		meta: publicShareMeta(params.token, loaderData),
	}),
	loader: ({ params }) => publicShare({ data: { token: params.token } }),
});
