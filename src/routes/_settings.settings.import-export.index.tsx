import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_settings/settings/import-export/")({
	beforeLoad: () => {
		throw redirect({ href: "/settings/import" });
	},
});
