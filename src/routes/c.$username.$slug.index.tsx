import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/c/[username]/[slug]/page";

export const Route = createFileRoute("/c/$username/$slug/")({
	component: Page,
});
