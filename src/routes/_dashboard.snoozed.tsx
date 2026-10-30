import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(dashboard)/snoozed/layout";

export const Route = createFileRoute("/_dashboard/snoozed")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
