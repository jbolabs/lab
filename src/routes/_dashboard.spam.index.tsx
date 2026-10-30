import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(dashboard)/spam/page";

export const Route = createFileRoute("/_dashboard/spam/")({ component: Page });
