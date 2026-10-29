export interface Domain {
	id: string;
	hostname: string;
	status?: string;
}

export interface AccountAliasDraft {
	id: string;
	domainId: string;
	localPart: string;
}

export interface AccountAliasesProps {
	domains: Domain[];
	domainId: string;
	username: string;
	useAllDomains: boolean;
	onUseAllDomainsChange: (value: boolean) => void;
	aliases: AccountAliasDraft[];
	onAliasesChange: (aliases: AccountAliasDraft[]) => void;
}

export interface Account {
	id: string;
	email: string;
	name: string;
	resetEmail: string | null;
	role: "admin" | "user";
	isPrimaryAdmin?: boolean;
	disabled?: boolean;
	hasAvatar?: boolean;
	canManageMailboxes?: boolean;
	canManageDomains?: boolean;
	canManageUsers?: boolean;
	createdAt: string;
	lastSignInAt?: string | null;
	deletedAt?: string | null;
	mailboxId?: string | null;
	localPart?: string | null;
	hostname?: string | null;
}

export interface AccountResponse {
	accounts?: Account[];
	account?: Account;
	error?: string;
}
