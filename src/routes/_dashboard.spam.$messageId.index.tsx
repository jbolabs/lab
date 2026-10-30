import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/spam/[messageId]/page";

export const Route = createFileRoute("/_dashboard/spam/$messageId/")({
	component: Page,
});
