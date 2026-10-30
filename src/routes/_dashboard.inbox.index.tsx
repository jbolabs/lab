import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/inbox/page";

export const Route = createFileRoute("/_dashboard/inbox/")({ component: Page });
