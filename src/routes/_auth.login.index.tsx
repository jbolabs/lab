import { createFileRoute } from "@tanstack/react-router";

import Page from "@/app/(auth)/login/page";
import { login } from "@/lib/route-data";
import { authRouteHead } from "@/lib/route-head";

export const Route = createFileRoute("/_auth/login/")({
	component: Page,
	head: ({ matches }) => authRouteHead("auth.signIn", matches[0]?.loaderData),
	loader: ({ deps }) => login({ data: deps }),
	loaderDeps: ({ search }) => search,
	validateSearch: (search: Record<string, unknown>) =>
		Object.fromEntries(
			Object.entries(search)
				.filter(([, value]) =>
					["string", "number", "boolean"].includes(typeof value)
				)
				.map(([key, value]) => [key, String(value)])
		) as Record<string, string>,
});
