import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/audit-logs/")({
	beforeLoad: () => {
		throw redirect({ href: "/activity" });
	},
});
