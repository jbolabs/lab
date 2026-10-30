import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(dashboard)/sent/layout";

export const Route = createFileRoute("/_dashboard/sent")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
