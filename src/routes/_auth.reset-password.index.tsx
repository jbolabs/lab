import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(auth)/reset-password/page";
import { authRouteHead } from "@/lib/route-head";

export const Route = createFileRoute("/_auth/reset-password/")({
	component: Page,
	head: ({ matches }) =>
		authRouteHead("auth.reset.chooseNew", matches[0]?.loaderData),
});
