import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/register/")({
	beforeLoad: () => {
		throw redirect({ href: "/setup" });
	},
});
