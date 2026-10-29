export interface MailboxDetail {
	id: string;
	userId: string;
	domainId: string;
	localPart: string;
	displayName: string | null;
	useAllDomains: boolean;
	hasAvatar?: boolean;
	type?: "personal" | "shared";
	permission?: "read_only" | "send_as" | "send_on_behalf" | "full_access";
	disabled?: boolean;
	createdAt: string;
	hostname: string;
	isPrimary?: boolean;
}

export interface MailboxDetailResponse {
	mailbox?: MailboxDetail;
	error?: string;
}

export interface MailboxAvatarFormProps {
	mailboxId: string;
	hasAvatar: boolean;
	name: string;
}

export interface MailboxAvatarUploadResponse {
	error?: string;
}

export interface MailboxAlias {
	id: string;
	domainId: string;
	localPart: string;
	hostname: string;
	createdAt: string;
}

export interface MailboxAliasDomain {
	id: string;
	hostname: string;
}

export interface MailboxAliasesResponse {
	aliases: MailboxAlias[];
	availableDomains: MailboxAliasDomain[];
	error?: string;
}

export interface SharedInboxMember {
	id: string;
	userId: string;
	userEmail: string;
	userName: string;
	permission: "read_only" | "send_as" | "send_on_behalf" | "full_access";
	createdAt: string;
}

export interface SharedInboxAccount {
	id: string;
	email: string;
	name: string;
	role: "admin" | "user";
}

export interface SharedInboxAccessResponse {
	members: SharedInboxMember[];
	availableUsers: SharedInboxAccount[];
	error?: string;
}
