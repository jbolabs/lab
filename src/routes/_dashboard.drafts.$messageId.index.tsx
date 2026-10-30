import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/drafts/[messageId]/page";

export const Route = createFileRoute("/_dashboard/drafts/$messageId/")({
	component: Page,
});
