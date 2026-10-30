import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/agent/page";

export const Route = createFileRoute("/_admin/agent/")({ component: Page });
