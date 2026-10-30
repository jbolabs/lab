import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(calendar)/layout";

export const Route = createFileRoute("/_calendar")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
