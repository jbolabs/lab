import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(drive)/drive/document/page";

export const Route = createFileRoute("/_drive/drive/document/")({
	component: Page,
});
