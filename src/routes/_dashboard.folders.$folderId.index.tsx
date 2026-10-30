import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/folders/[folderId]/page";

export const Route = createFileRoute("/_dashboard/folders/$folderId/")({
	component: Page,
});
