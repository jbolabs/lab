import { createRouter } from "@tanstack/react-router";

import { parseSearch, stringifySearch } from "@/lib/navigation-search";
import { getNavigationTransitionType } from "@/lib/navigation-transition-utils";

import { routeTree } from "./routeTree.gen";

// Matches the phone layout breakpoint in globals.css, where one screen replaces another.
const PHONE_QUERY = "(max-width: 767px)";

// Only start a view transition where it is styled: browsers without transition types would fall
// back to an untyped transition on every navigation.
function supportsTypedViewTransitions() {
	return (
		typeof document !== "undefined" &&
		typeof document.startViewTransition === "function" &&
		CSS.supports("selector(:active-view-transition-type(a))")
	);
}

export function getRouter() {
	return createRouter({
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultStaleTime: 0,
		defaultViewTransition: supportsTypedViewTransitions() && {
			types: ({ fromLocation, toLocation }) => {
				if (!window.matchMedia(PHONE_QUERY).matches) {
					return false;
				}
				const type = getNavigationTransitionType(
					fromLocation?.pathname,
					toLocation.pathname
				);
				return type ? [type] : false;
			},
		},
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
