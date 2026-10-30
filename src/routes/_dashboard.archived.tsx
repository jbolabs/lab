import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(dashboard)/archived/layout";

export const Route = createFileRoute("/_dashboard/archived")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
