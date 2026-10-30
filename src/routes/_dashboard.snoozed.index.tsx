import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/snoozed/page";

export const Route = createFileRoute("/_dashboard/snoozed/")({
	component: Page,
});
