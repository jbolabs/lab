import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/trash/page";

export const Route = createFileRoute("/_dashboard/trash/")({ component: Page });
