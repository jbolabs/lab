import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface AuthShellStep {
	label: string;
	active: boolean;
}

export interface AuthShellProps {
	icon: LucideIcon;
	title: string;
	description?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	steps?: AuthShellStep[];
}
