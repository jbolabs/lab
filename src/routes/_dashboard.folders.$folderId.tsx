import { createFileRoute, Outlet } from "@tanstack/react-router";

import Layout from "@/app/(dashboard)/folders/[folderId]/layout";

export const Route = createFileRoute("/_dashboard/folders/$folderId")({
	component: () => (
		<Layout>
			<Outlet />
		</Layout>
	),
});
