import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/accounts/[id]/permissions/page";

export const Route = createFileRoute("/_admin/accounts/$id/permissions/")({
	component: Page,
});
