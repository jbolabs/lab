import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(settings)/settings/import/page";

export const Route = createFileRoute("/_settings/settings/import/")({
	component: Page,
});
