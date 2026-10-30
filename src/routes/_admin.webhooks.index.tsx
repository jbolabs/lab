import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/webhooks/page";

export const Route = createFileRoute("/_admin/webhooks/")({ component: Page });
