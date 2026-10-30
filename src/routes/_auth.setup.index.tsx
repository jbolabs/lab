import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(auth)/setup/page";
import { setup } from "@/lib/route-data";

export const Route = createFileRoute("/_auth/setup/")({
	component: Page,
	loader: () => setup(),
});
