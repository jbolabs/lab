export interface DomainListResult {
	domains?: { id: string; hostname: string }[];
}

export interface DomainCreateResult {
	domain?: { id: string };
	error?: string;
	code?: "MX_RECORDS_CONFLICT";
}

export interface DomainPreflight {
	hostname: string;
	zone: { id: string; name: string };
}

export interface DomainPreflightResponse {
	ok: boolean;
	domain?: DomainPreflight;
	error?: string;
}

export interface MailboxCreateResult {
	error?: string;
}
