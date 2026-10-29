import type { ThreadMessage } from "@/hooks/types";

export interface ThreadMessageActionsProps {
	message: ThreadMessage;
	mailboxId: string | null;
	ownAddress?: string | null;
	ownAddresses?: string[];
	starOnly?: boolean;
}
