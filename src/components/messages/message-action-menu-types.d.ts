import type { ReactNode } from "react";

export interface MessageMenuAction {
	label: string;
	icon: ReactNode;
	onSelect: () => void;
	disabled?: boolean;
}
export interface MessageActionMenuProps {
	actions: MessageMenuAction[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	disabled?: boolean;
}
