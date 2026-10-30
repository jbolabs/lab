import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/trash/[messageId]/page";

export const Route = createFileRoute("/_dashboard/trash/$messageId/")({
	component: Page,
});
