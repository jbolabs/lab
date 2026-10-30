import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(drive)/layout";

export const Route = createFileRoute("/_drive")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
