import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(drive)/drive/page";

export const Route = createFileRoute("/_drive/drive/")({ component: Page });
