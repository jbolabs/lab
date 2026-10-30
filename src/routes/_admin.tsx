import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(admin)/layout";

export const Route = createFileRoute("/_admin")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
