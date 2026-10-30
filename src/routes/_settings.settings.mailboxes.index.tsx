import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(settings)/settings/mailboxes/page";

export const Route = createFileRoute("/_settings/settings/mailboxes/")({
	component: Page,
});
