import type { ReactNode } from "react";

import type { BrandApp } from "./brand-name";

export interface SidebarState {
	minimal: boolean;
	width: number;
	userId: string | null;
	toggle: () => void;
	setWidth: (width: number) => void;
	setForcedMinimal: (minimal: boolean) => void;
	mobile: boolean;
	mobileOpen: boolean;
}

export interface SidebarProviderProps {
	children: ReactNode;
	expandedWidth?: number;
	mobileOverlay?: boolean;
}

export interface SidebarHeaderProps {
	href: string;
	/** The app the sidebar belongs to, named beside the tile ("the inbox"); the suite otherwise. */
	app?: BrandApp;
}

export interface SidebarScaffoldProps {
	header: ReactNode;
	footer?: ReactNode;
	children: ReactNode;
	className?: string;
}
