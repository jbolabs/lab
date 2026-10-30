import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(auth)/forgot-password/page";
import { authRouteHead } from "@/lib/route-head";

export const Route = createFileRoute("/_auth/forgot-password/")({
	component: Page,
	head: ({ matches }) =>
		authRouteHead("auth.forgot.title", matches[0]?.loaderData),
});
