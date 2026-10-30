import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/routing/page";

export const Route = createFileRoute("/_admin/routing/")({ component: Page });
