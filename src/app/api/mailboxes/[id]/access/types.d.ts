export interface MailboxAccessRouteParams {
	params: Promise<{ id: string }>;
}

export interface MailboxAccessResponseItem {
	id: string;
	userId: string;
	userEmail: string;
	userName: string;
	permission: "read_only" | "send_as" | "send_on_behalf" | "full_access";
	createdAt: string;
}

export interface MailboxAccessAccountItem {
	id: string;
	email: string;
	name: string;
	role: "admin" | "user";
}
