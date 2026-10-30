import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/sent/page";

export const Route = createFileRoute("/_dashboard/sent/")({ component: Page });
