import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/sent/[messageId]/page";

export const Route = createFileRoute("/_dashboard/sent/$messageId/")({
	component: Page,
});
