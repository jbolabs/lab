import {
	useLocation,
	useParams as useRouteParams,
	useRouter as useTanStackRouter,
	redirect as routeRedirect,
} from "@tanstack/react-router";
import { useMemo } from "react";

export function usePathname() {
	return useLocation({ select: (location) => location.pathname });
}
export function useSearchParams() {
	const search = useLocation({ select: (location) => location.searchStr });
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
