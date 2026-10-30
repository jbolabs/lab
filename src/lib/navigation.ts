import {
	useRouterState,
	useParams as useRouteParams,
	useRouter as useTanStackRouter,
	redirect as routeRedirect,
} from "@tanstack/react-router";
import { useMemo } from "react";

// Like Next's hooks, these follow the committed route, not the one still loading: reading the
// pending location re-renders the old screen as the new one, which the phone view transition
// would then snapshot as its starting frame.
export function usePathname() {
	return useRouterState({
		select: (state) => (state.resolvedLocation ?? state.location).pathname,
	});
}
export function useSearchParams() {
	const search = useRouterState({
		select: (state) => (state.resolvedLocation ?? state.location).searchStr,
	});
	return useMemo(() => new URLSearchParams(search), [search]);
}
export function useParams<T = Record<string, string>>() {
	const params = useRouteParams({ strict: false });
	return params as T;
}
export function useRouter() {
	const router = useTanStackRouter();
	return useMemo(
		() => ({
			back: () => router.history.back(),
			forward: () => router.history.forward(),
			prefetch: (href: string) => router.preloadRoute({ to: href }),
			push: (href: string, options?: { scroll?: boolean }) =>
				router.navigate({ href, resetScroll: options?.scroll !== false }),
			refresh: () => router.invalidate(),
			replace: (href: string, options?: { scroll?: boolean }) =>
				router.navigate({
					href,
					replace: true,
					resetScroll: options?.scroll !== false,
				}),
		}),
		[router]
	);
}
export function redirect(href: string): never {
	throw routeRedirect({ href });
}
