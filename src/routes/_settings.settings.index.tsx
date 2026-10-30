import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(settings)/settings/page";

export const Route = createFileRoute("/_settings/settings/")({
	component: Page,
});
