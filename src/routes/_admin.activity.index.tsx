import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/activity/page";

export const Route = createFileRoute("/_admin/activity/")({ component: Page });
