import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(settings)/settings/rules/page";

export const Route = createFileRoute("/_settings/settings/rules/")({
	component: Page,
});
