import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(settings)/settings/app-passwords/page";

export const Route = createFileRoute("/_settings/settings/app-passwords/")({
	component: Page,
});
