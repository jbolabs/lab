import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(admin)/accounts/[id]/layout";

export const Route = createFileRoute("/_admin/accounts/$id")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
