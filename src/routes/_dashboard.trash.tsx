import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(dashboard)/trash/layout";

export const Route = createFileRoute("/_dashboard/trash")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
