import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { domains } from "@/db/schema";
import { canManageDomains } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import { adoptCloudflareZone } from "@/lib/domains/adopt-zone";
import type { DnsAuthRecord } from "@/lib/domains/dns-audit";
import { setupDomainDnsRecord } from "@/lib/domains/dns-setup";
import { getDomainDnsView } from "@/lib/domains/dns-view";
import { MxConflictError } from "@/lib/domains/receiving-dns";
import { getDomainForUser } from "@/lib/domains/service";

interface Params {
	params: Promise<{ id: string }>;
}

const DNS_RECORDS = new Set<DnsAuthRecord>(["mx", "spf", "dkim", "dmarc"]);

export async function POST(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!canManageDomains(user)) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	let domain = await getDomainForUser(env, user.id, id);
	if (!domain) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	const body = (await request.json().catch(() => ({}))) as {
		record?: string;
		replaceMx?: boolean;
	};
	const record = body.record as DnsAuthRecord | undefined;
	if (!record || !DNS_RECORDS.has(record)) {
		return Response.json({ error: "Unknown DNS record" }, { status: 400 });
	}

	try {
		// A domain added with DNS skipped gets its real zone on the first setup.
		domain = await adoptCloudflareZone(env, domain);
		await setupDomainDnsRecord(env, domain, record, {
			replaceMx: body.replaceMx === true,
		});
		const dns = await getDomainDnsView(env, domain);
		const [updated] = await getDb(env)
			.select()
			.from(domains)
			.where(eq(domains.id, domain.id))
			.limit(1);
		return Response.json({
			dns,
			domain: { ...(updated ?? domain), sendingEnabled: dns.sendingEnabled },
		});
	} catch (error) {
		// 409 MX_CONFLICT asks the caller to confirm and retry with replaceMx.
		if (error instanceof MxConflictError) {
			return Response.json(
				{ code: error.code, error: error.message, records: error.records },
				{ status: 409 }
			);
		}
		const message =
			error instanceof Error ? error.message : "Failed to set up DNS record";
		return Response.json({ error: message }, { status: 500 });
	}
}
