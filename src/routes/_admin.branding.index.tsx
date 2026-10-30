import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(admin)/branding/page";

export const Route = createFileRoute("/_admin/branding/")({ component: Page });
