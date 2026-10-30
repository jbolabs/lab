import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(dashboard)/inbox/layout";

export const Route = createFileRoute("/_dashboard/inbox")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
