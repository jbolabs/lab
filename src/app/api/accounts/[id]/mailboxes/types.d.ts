export interface AccountMailboxesRouteParams {
	params: Promise<{ id: string }>;
}

export interface AccountMailboxItem {
	id: string;
	domainId: string;
	localPart: string;
	hostname: string;
	displayName: string | null;
	type: "personal" | "shared";
	createdAt: Date;
}
