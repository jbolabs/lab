import type { CfDnsRecord } from "@/lib/cloudflare-api.types";
import { queryDns } from "@/lib/dns-query";
import type { DnsQueryType } from "@/lib/dns-query";

export type DnsAuthRecord = "mx" | "spf" | "dkim" | "dmarc";

export type DnsAuthStatus = "ok" | "missing" | "unknown";

export interface DnsAuthCheck {
	record: DnsAuthRecord;
	label: string;
	name: string;
	status: DnsAuthStatus;
	found: string[];
}

export interface DomainDnsAudit {
	mx: DnsAuthCheck;
	spf: DnsAuthCheck;
	dkim: DnsAuthCheck;
	dmarc: DnsAuthCheck;
}

interface AuditInput {
	routing: { records: CfDnsRecord[]; missing: CfDnsRecord[] };
	sending: CfDnsRecord[];
	dkimSelector?: string;
}

function isTxt(record: CfDnsRecord) {
	return record.type?.toUpperCase() === "TXT";
}

async function check(
	record: DnsAuthRecord,
	label: string,
	name: string,
	type: DnsQueryType,
	matches: (value: string) => boolean
): Promise<DnsAuthCheck> {
	try {
		const answers = await queryDns(name, type);
		const found = answers.filter(matches);
		return {
			found,
			label,
			name,
			record,
			status: found.length > 0 ? "ok" : "missing",
		};
	} catch {
		return { found: [], label, name, record, status: "unknown" };
	}
}

/**
 * Independently verifies the public DNS a domain needs, rather than trusting
 * the zone records the Cloudflare API reports. MX, SPF and DMARC are checked at
 * their canonical names; DKIM uses the selector the sending subdomain was
 * provisioned with. A name that resolves is "ok", one that answers NXDOMAIN is
 * "missing", and a lookup that fails outright is "unknown".
 */
export async function auditDomainDns(
	hostname: string,
	view: AuditInput,
	sendingProvider?: string
): Promise<DomainDnsAudit> {
	const expected = [
		...view.routing.records,
		...view.routing.missing,
		...view.sending,
	];
	// Cloudflare reports the selector it signs with, which is more reliable than
	// guessing from the subdomain's DNS records (whose names may be relative).
	const dkimName =
		(view.dkimSelector
			? `${view.dkimSelector}._domainkey.${hostname}`
			: undefined) ??
		expected.find(
			(record) => isTxt(record) && /_domainkey/iu.test(record.name ?? "")
		)?.name ??
		(sendingProvider === "resend"
			? `resend._domainkey.${hostname}`
			: undefined);

	const [mx, spf, dmarc] = await Promise.all([
		check(
			"mx",
			"MX",
			hostname,
			"MX",
			(value) => !/^0\s*\.?$/u.test(value.trim())
		),
		check("spf", "SPF", hostname, "TXT", (value) => /v=spf1/iu.test(value)),
		check("dmarc", "DMARC", `_dmarc.${hostname}`, "TXT", (value) =>
			/v=DMARC1/iu.test(value)
		),
	]);

	const dkim: DnsAuthCheck = dkimName
		? await check("dkim", "DKIM", dkimName, "TXT", () => true)
		: {
				found: [],
				label: "DKIM",
				name: `*._domainkey.${hostname}`,
				record: "dkim",
				status: "unknown",
			};

	return { dkim, dmarc, mx, spf };
}
