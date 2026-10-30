import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(dashboard)/starred/layout";

export const Route = createFileRoute("/_dashboard/starred")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
