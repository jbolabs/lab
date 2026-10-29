export interface ResendDomainRecord {
	record: string;
	name: string;
	type: "MX" | "TXT" | "CNAME";
	value: string;
	ttl?: string | number;
	status?: string;
	priority?: number;
}

export interface ResendDomain {
	id: string;
	name: string;
	status: string;
	capabilities?: { sending?: string; receiving?: string };
	records?: ResendDomainRecord[];
}

export interface ResendWebhook {
	id: string;
	endpoint: string;
	events?: string[];
}

export interface ResendReceivedEmail {
	id: string;
	from: string;
	to: string[];
	cc?: string[];
	bcc?: string[];
	subject?: string;
	message_id?: string;
	raw?: { download_url: string; expires_at?: string };
}
