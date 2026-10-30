import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/starred/[messageId]/page";

export const Route = createFileRoute("/_dashboard/starred/$messageId/")({
	component: Page,
});
