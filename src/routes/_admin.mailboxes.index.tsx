import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/mailboxes/page";

export const Route = createFileRoute("/_admin/mailboxes/")({ component: Page });
