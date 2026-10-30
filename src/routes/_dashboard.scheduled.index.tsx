import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/scheduled/page";

export const Route = createFileRoute("/_dashboard/scheduled/")({
	component: Page,
});
