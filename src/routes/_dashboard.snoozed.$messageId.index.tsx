import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/snoozed/[messageId]/page";

export const Route = createFileRoute("/_dashboard/snoozed/$messageId/")({
	component: Page,
});
