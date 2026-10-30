import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/agent/review/[id]/page";

export const Route = createFileRoute("/_dashboard/agent/review/$id/")({
	component: Page,
});
