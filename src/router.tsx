import { createRouter } from "@tanstack/react-router";

import { parseSearch, stringifySearch } from "@/lib/navigation-search";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
	return createRouter({
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultStaleTime: 0,
		parseSearch,
		routeTree,
		scrollRestoration: true,
		stringifySearch,
	});
}
declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
