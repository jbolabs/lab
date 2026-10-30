import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/archived/[messageId]/page";

export const Route = createFileRoute("/_dashboard/archived/$messageId/")({
	component: Page,
});
