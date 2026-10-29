export interface MailboxRouteParams {
	params: Promise<{ id: string }>;
}

export interface MailboxUpdateValues {
	displayName?: string | null;
	signature?: string | null;
	autoReplyEnabled?: boolean;
	autoReplySubject?: string;
	autoReplyBody?: string;
	useAllDomains?: boolean;
}
