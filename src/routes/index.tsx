import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/page";
import { home } from "@/lib/route-data";

export const Route = createFileRoute("/")({
	component: Page,
	loader: () => home(),
});
