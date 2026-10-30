import { Link } from "@tanstack/react-router";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
	href: string;
	prefetch?: boolean;
	replace?: boolean;
	scroll?: boolean;
};
/** Shared anchor API for dynamic URLs; routing and preloading belong to TanStack Router. */
export default forwardRef<HTMLAnchorElement, Props>(
	({ href, prefetch, replace, scroll, ...props }, ref) => (
		<Link
			ref={ref}
			to={href}
			replace={replace}
			resetScroll={scroll !== false}
			preload={prefetch === false ? false : "intent"}
			{...props}
		/>
	)
);
