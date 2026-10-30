import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/inbox/[messageId]/page";

export const Route = createFileRoute("/_dashboard/inbox/$messageId/")({
	component: Page,
});
