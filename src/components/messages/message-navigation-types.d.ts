import type { MouseEvent } from "react";

export interface MessageNavigationState {
	progress: number | null;
	onNavigate: (
		event: MouseEvent<HTMLAnchorElement>,
		markRead?: boolean
	) => void;
}
