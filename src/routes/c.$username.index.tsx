import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/c/[username]/page";

export const Route = createFileRoute("/c/$username/")({ component: Page });
