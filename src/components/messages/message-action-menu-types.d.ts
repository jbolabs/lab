import type { ReactNode } from "react";

export type MessageMenuAction = { label: string; icon: ReactNode; onSelect: () => void; disabled?: boolean };
export interface MessageActionMenuProps {
	actions: MessageMenuAction[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	disabled?: boolean;
}
