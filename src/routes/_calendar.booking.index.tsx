import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(calendar)/booking/page";

export const Route = createFileRoute("/_calendar/booking/")({
	component: Page,
});
