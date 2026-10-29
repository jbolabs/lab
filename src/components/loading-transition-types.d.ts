import type { ReactNode } from "react";

export interface LoadingTransitionProps {
	children?: ReactNode;
	ready: boolean;
}

export interface PageLoadingContextValue {
	reportLoading: (id: string, loading: boolean) => void;
}
