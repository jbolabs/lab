import type { ReactNode } from "react";
import type { BrandApp } from "./brand-name";

export type SidebarState = {
	minimal: boolean;
	width: number;
	userId: string | null;
	toggle(): void;
	setWidth(width: number): void;
	setForcedMinimal(minimal: boolean): void;
	mobile: boolean;
	mobileOpen: boolean;
};

export type SidebarProviderProps = {
	children: ReactNode;
	expandedWidth?: number;
	mobileOverlay?: boolean;
};

export type SidebarHeaderProps = {
	href: string;
	/** The app the sidebar belongs to, named beside the tile ("the inbox"); the suite otherwise. */
	app?: BrandApp;
};

export type SidebarScaffoldProps = {
	header: import("react").ReactNode;
	footer?: import("react").ReactNode;
	children: import("react").ReactNode;
	className?: string;
};
