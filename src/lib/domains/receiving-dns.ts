import type { CfDnsRecord } from "@/lib/cloudflare-api.types";
import {
	createDnsRecord,
	deleteDnsRecord,
	listMxRecords,
} from "@/lib/cloudflare-dns";
import { queryDns } from "@/lib/dns-query";
import { isManualZone } from "@/lib/domains/manual-zone";
import type { DomainRow } from "@/lib/domains/types";

export async function listDomainMx(
	env: CloudflareEnv,
	domain: DomainRow
): Promise<CfDnsRecord[]> {
	if (isManualZone(domain.zoneId)) {
		return [];
	}
	return await listMxRecords(env, domain.zoneId, domain.hostname);
}

const same = (a: string, b: string) =>
	a.trim().toLowerCase().replace(/\.$/u, "") ===
	b.trim().toLowerCase().replace(/\.$/u, "");

async function hasPublicMx(
	hostname: string,
	content: string
): Promise<boolean | null> {
	try {
		const answers = await queryDns(hostname, "MX");
		return answers.some((answer) =>
			same(answer.replace(/^\d+\s+/u, ""), content)
		);
	} catch {
		return null;
	}
}

/** Whether an MX record for `content` is in the zone, or in public DNS when the zone is manual; null when it cannot be checked. */
export async function hasMx(
	env: CloudflareEnv,
	domain: DomainRow,
	content: string
): Promise<boolean | null> {
	if (isManualZone(domain.zoneId)) {
		return hasPublicMx(domain.hostname, content);
	}
	return await listDomainMx(env, domain).then((resolved) =>
		resolved.some((record) => same(record.content ?? "", content))
	);
}

/** Thrown when other mail servers' MX records would shadow the one being added. */
export class MxConflictError extends Error {
	override name = "MxConflictError";
	readonly records: { content: string; priority: number }[];
	readonly code = "MX_CONFLICT";
	constructor(
		records: { content: string; priority: number }[],
		message = "This domain has MX records for another mail service. Replace them to receive mail here."
	) {
		super(message);
		this.records = records;
	}
}

/**
 * Points the domain's MX at `content`. Any other MX record is a conflict (mail
 * goes to the lowest priority), so without `replace` this throws and nothing changes.
 * Returns the records it deleted.
 */
export async function publishMx(
	env: CloudflareEnv,
	domain: DomainRow,
	content: string,
	options: { replace: boolean; priority?: number }
): Promise<CfDnsRecord[]> {
	if (isManualZone(domain.zoneId)) {
		return [];
	}
	const existing = await listDomainMx(env, domain);
	const others = existing.filter(
		(record) => !same(record.content ?? "", content)
	);
	if (others.length > 0 && !options.replace) {
		throw new MxConflictError(
			others.map((record) => ({
				content: record.content ?? "",
				priority: record.priority ?? 0,
			}))
		);
	}
	for (const record of others) {
		if (record.id) {
			await deleteDnsRecord(env, domain.zoneId, record.id);
		}
	}
	if (!existing.some((record) => same(record.content ?? "", content))) {
		await createDnsRecord(env, domain.zoneId, {
			content,
			name: domain.hostname,
			priority: options.priority ?? 10,
			ttl: 3600,
			type: "MX",
		});
	}
	return others;
}

export async function removeMx(
	env: CloudflareEnv,
	domain: DomainRow,
	matches: (content: string) => boolean
): Promise<void> {
	if (isManualZone(domain.zoneId)) {
		return;
	}
	for (const record of await listDomainMx(env, domain)) {
		if (record.id && matches(record.content ?? "")) {
			await deleteDnsRecord(env, domain.zoneId, record.id);
		}
	}
}

export const isInboundSmtpMx = (content: string) =>
	/inbound-smtp\.[a-z0-9-]+\.amazonaws\.com\.?$/iu.test(content.trim());
