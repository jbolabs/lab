export interface AccountMailboxAccessRouteParams {
	params: Promise<{ id: string }>;
}

export interface AccountMailboxAccessItem {
	mailboxId: string;
	localPart: string;
	hostname: string;
	displayName: string | null;
	permission: "read_only" | "send_as" | "send_on_behalf" | "full_access" | null;
}
