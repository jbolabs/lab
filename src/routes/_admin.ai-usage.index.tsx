import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/ai-usage/page";

export const Route = createFileRoute("/_admin/ai-usage/")({ component: Page });
