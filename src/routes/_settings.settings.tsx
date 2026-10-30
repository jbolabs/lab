import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(settings)/settings/layout";

export const Route = createFileRoute("/_settings/settings")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
