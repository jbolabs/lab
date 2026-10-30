import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(settings)/settings/account/page";

export const Route = createFileRoute("/_settings/settings/account/")({
	component: Page,
});
