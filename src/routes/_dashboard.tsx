import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(dashboard)/layout";

export const Route = createFileRoute("/_dashboard")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
