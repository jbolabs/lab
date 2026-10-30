import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/archived/page";

export const Route = createFileRoute("/_dashboard/archived/")({
	component: Page,
});
