import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(settings)/layout";

export const Route = createFileRoute("/_settings")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
