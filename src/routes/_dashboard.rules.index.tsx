import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_dashboard/rules/")({
	beforeLoad: () => {
		throw redirect({ href: "/settings/account" });
	},
});
