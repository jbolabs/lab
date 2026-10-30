import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(settings)/settings/mailboxes/[id]/page";

export const Route = createFileRoute("/_settings/settings/mailboxes/$id/")({
	component: Page,
});
