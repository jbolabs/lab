import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(calendar)/calendar/page";

export const Route = createFileRoute("/_calendar/calendar/")({
	component: Page,
});
