import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(dashboard)/spam/layout";

export const Route = createFileRoute("/_dashboard/spam")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
