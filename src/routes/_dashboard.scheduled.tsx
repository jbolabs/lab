import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(dashboard)/scheduled/layout";

export const Route = createFileRoute("/_dashboard/scheduled")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
