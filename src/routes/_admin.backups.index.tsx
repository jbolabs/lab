import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/backups/page";

export const Route = createFileRoute("/_admin/backups/")({ component: Page });
