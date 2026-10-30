import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_settings/settings/auto-reply/")({
	beforeLoad: () => {
		throw redirect({ href: "/settings/inbox" });
	},
});
