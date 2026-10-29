import type { ReactNode, RefObject } from "react";

export interface PullToRefreshProps {
	/** The scroll container whose top the pull starts from. */
	scroller: RefObject<HTMLElement | null>;
	/** Resolves when fresh content is in; the spinner stays until then. */
	onRefresh: () => Promise<unknown>;
	children: ReactNode;
}
