import { requireAwsConfig } from "@/lib/aws/config";
import {
	createSesIdentity,
	deleteSesIdentity,
	getSesAccount,
	getSesIdentity,
} from "@/lib/aws/ses";
import type { SesSendingView } from "@/lib/aws/ses-sending-types";
import {
	createDnsRecord,
	deleteDnsRecord,
	listDnsRecords,
} from "@/lib/cloudflare-dns";
import { isManualZone } from "@/lib/domains/provision";
import type { DomainRow } from "@/lib/domains/types";

const same = (a: string, b: string) =>
	a.trim().toLowerCase().replace(/\.$/u, "") ===
	b.trim().toLowerCase().replace(/\.$/u, "");

async function missingRecords(
	env: CloudflareEnv,
	domain: DomainRow,
	records: { name: string; value: string }[]
): Promise<number | null> {
	if (isManualZone(domain.zoneId)) {
		return null;
	}
	try {
		const present = await Promise.all(
			records.map(async (record) => {
				const existing = await listDnsRecords(env, domain.zoneId, {
					name: record.name,
					type: "CNAME",
				});
				return existing.some((item) => same(item.content ?? "", record.value));
			})
		);
		return present.filter((exists) => !exists).length;
	} catch {
		return null;
	}
}

async function view(
	env: CloudflareEnv,
	domain: DomainRow
): Promise<SesSendingView> {
	const config = await requireAwsConfig(env);
	const [identity, account] = await Promise.all([
		getSesIdentity(config, domain.hostname),
		getSesAccount(config).catch(() => null),
	]);
	return {
		dkimStatus: identity.dkimStatus,
		dnsManaged: !isManualZone(domain.zoneId),
		missingDns: identity.registered
			? await missingRecords(env, domain, identity.records)
			: null,
		productionAccess: account?.productionAccess ?? null,
		records: identity.records,
		region: config.region,
		registered: identity.registered,
		verified: identity.verified,
	};
}

/** Registers the domain identity in SES and publishes its DKIM CNAMEs to the Cloudflare zone. */
export async function setupSesSending(
	env: CloudflareEnv,
	domain: DomainRow
): Promise<SesSendingView> {
	const config = await requireAwsConfig(env);
	const identity = await createSesIdentity(config, domain.hostname);
	if (!isManualZone(domain.zoneId)) {
		for (const record of identity.records) {
			const existing = await listDnsRecords(env, domain.zoneId, {
				name: record.name,
				type: "CNAME",
			});
			if (existing.some((item) => same(item.content ?? "", record.value))) {
				continue;
			}
			await createDnsRecord(env, domain.zoneId, {
				content: record.value,
				name: record.name,
				proxied: false,
				ttl: 3600,
				type: "CNAME",
			});
		}
	}
	return view(env, domain);
}

export async function removeSesSending(
	env: CloudflareEnv,
	domain: DomainRow
): Promise<void> {
	const config = await requireAwsConfig(env);
	const identity = await getSesIdentity(config, domain.hostname);
	if (!isManualZone(domain.zoneId)) {
		for (const record of identity.records) {
			for (const item of await listDnsRecords(env, domain.zoneId, {
				name: record.name,
				type: "CNAME",
			})) {
				if (item.id && same(item.content ?? "", record.value)) {
					await deleteDnsRecord(env, domain.zoneId, item.id);
				}
			}
		}
	}
	await deleteSesIdentity(config, domain.hostname);
}

export const getSesSendingView = view;
