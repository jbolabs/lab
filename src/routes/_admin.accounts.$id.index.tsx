import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/accounts/[id]/page";

export const Route = createFileRoute("/_admin/accounts/$id/")({
	component: Page,
});
