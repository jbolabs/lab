import type { CfDnsRecord } from "@/lib/cloudflare-api";
import type {
	DnsAuthRecord,
	DnsAuthStatus,
	DomainDnsAudit,
} from "@/lib/domains/dns-audit";

export type DnsAuthSummary = Record<DnsAuthRecord, DnsAuthStatus>;

export interface DnsStatusSummary {
	routing: {
		configured: boolean;
		missing: string[];
	};
	sending: {
		configured: boolean;
		records: string[];
	};
	auth?: DnsAuthSummary;
}

export function summariseDns(
	routingRecords: CfDnsRecord[],
	routingMissing: CfDnsRecord[],
	sendingRecords: CfDnsRecord[],
	routingEnabled = false,
	sendingEnabled?: boolean,
	audit?: DomainDnsAudit
): DnsStatusSummary {
	const recordTypes = (
		type: "routing-records" | "routing-missing" | "sending"
	) => {
		const list = (() => {
			if (type === "routing-records") {
				return routingRecords;
			}
			if (type === "routing-missing") {
				return routingMissing;
			}
			return sendingRecords;
		})();
		return [...new Set(list.map((r) => r.type).filter(Boolean))] as string[];
	};

	return {
		auth: audit
			? {
					dkim: audit.dkim.status,
					dmarc: audit.dmarc.status,
					mx: audit.mx.status,
					spf: audit.spf.status,
				}
			: undefined,
		routing: {
			configured:
				routingMissing.length === 0 &&
				(routingRecords.length > 0 || routingEnabled),
			missing: recordTypes("routing-missing"),
		},
		sending: {
			configured: sendingEnabled ?? sendingRecords.length > 0,
			records: recordTypes("sending"),
		},
	};
}
