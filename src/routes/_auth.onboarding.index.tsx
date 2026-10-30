import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/onboarding/")({
	beforeLoad: () => {
		throw redirect({ href: "/setup" });
	},
});
