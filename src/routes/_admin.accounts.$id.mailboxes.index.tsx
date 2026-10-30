import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/accounts/[id]/mailboxes/page";

export const Route = createFileRoute("/_admin/accounts/$id/mailboxes/")({
	component: Page,
});
