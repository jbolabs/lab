import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_dashboard/import-export/")({
	beforeLoad: () => {
		throw redirect({ href: "/settings/import" });
	},
});
