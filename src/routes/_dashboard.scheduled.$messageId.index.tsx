import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/scheduled/[messageId]/page";

export const Route = createFileRoute("/_dashboard/scheduled/$messageId/")({
	component: Page,
});
