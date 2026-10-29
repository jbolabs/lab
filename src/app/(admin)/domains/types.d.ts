export type SendingProvider = "none" | "cloudflare" | "resend" | "ses";
export type ReceivingProvider = "none" | "cloudflare" | "resend" | "ses";

export interface Domain {
	id: string;
	hostname: string;
	status: string;
	routingEnabled: boolean;
	sendingEnabled: boolean;
	sendingRequested: boolean;
	sendingProvider: SendingProvider;
	receivingProvider: ReceivingProvider;
	zoneId: string;
	/** Added with DNS skipped: the Cloudflare zone is attached on first setup. */
	dnsSkipped?: boolean;
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

export interface DnsRecord {
	type?: string;
	name?: string;
	content?: string;
	priority?: number;
}

export type DnsAuthRecord = "mx" | "spf" | "dkim" | "dmarc";

export type DnsAuthStatus = "ok" | "missing" | "unknown";

export interface DnsAuthCheck {
	record: DnsAuthRecord;
	label: string;
	name: string;
	status: DnsAuthStatus;
	found: string[];
}

export type DomainDnsAudit = Record<DnsAuthRecord, DnsAuthCheck>;

export interface DnsStatusSummary {
	routing: { configured: boolean; missing: string[] };
	sending: { configured: boolean; records: string[] };
	auth?: Record<DnsAuthRecord, DnsAuthStatus>;
}

export interface DomainDnsView {
	routing: {
		records: DnsRecord[];
		missing: DnsRecord[];
		status?: string;
	};
	sending: DnsRecord[];
	sendingEnabled: boolean;
	dkimSelector?: string;
	sendingSubdomain?: { name: string; tag: string };
	audit?: DomainDnsAudit;
}

export type DomainDnsCache = Record<
	string,
	{ domain: Domain; dns: DomainDnsView }
>;

export interface DomainDnsDetailsProps {
	domain: Domain;
	dns: DomainDnsView;
	onSendingProviderChange?: (provider: SendingProvider) => void;
	sendingProviderBusy?: boolean;
	sendingProviderMessage?: string | null;
	onReceivingProviderChange?: (provider: ReceivingProvider) => void;
	receivingProviderBusy?: boolean;
	receivingProviderMessage?: string | null;
	/** Reload the DNS view after a setup that changed the zone. */
	onDnsChanged?: () => void;
	onSetup?: (record: DnsAuthRecord) => void;
	setupRecord?: DnsAuthRecord | null;
	setupMessage?: string | null;
}

export interface DomainItemCardProps {
	item: Domain;
	dns?: DnsStatusSummary;
	dnsDetails?: DomainDnsView;
	onSendingProviderChange?: (provider: SendingProvider) => void;
	sendingProviderBusy?: boolean;
	sendingProviderMessage?: string | null;
	onReceivingProviderChange?: (provider: ReceivingProvider) => void;
	receivingProviderBusy?: boolean;
	receivingProviderMessage?: string | null;
	onDnsChanged?: () => void;
	dnsLoading?: boolean;
	dnsError?: string | null;
	expanded?: boolean;
	remove: { mutate: (id: string) => void; isPending: boolean };
	onToggleDns: (id: string) => void;
	onSetup?: (record: DnsAuthRecord) => void;
	setupRecord?: DnsAuthRecord | null;
	setupMessage?: string | null;
}
