import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { domains } from "@/db/schema";
import { authenticateAdminApiKey } from "@/lib/api/admin-auth";
import { getEnv } from "@/lib/cloudflare";
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
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "domains");
	if (!auth) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const domain = await getDomainForUser(env, auth.userId, id);
	if (!domain) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const body = (await request.json().catch(() => ({}))) as {
		record?: string;
		replaceMx?: boolean;
	};
	const record = body.record as DnsAuthRecord | undefined;
	if (!record || !DNS_RECORDS.has(record)) {
		return NextResponse.json({ error: "Unknown DNS record" }, { status: 400 });
	}

	try {
		await setupDomainDnsRecord(env, domain, record, {
			replaceMx: body.replaceMx === true,
		});
		const dns = await getDomainDnsView(env, domain);
		const [updated] = await getDb(env)
			.select()
			.from(domains)
			.where(eq(domains.id, domain.id))
			.limit(1);
		return NextResponse.json({
			dns,
			domain: { ...(updated ?? domain), sendingEnabled: dns.sendingEnabled },
		});
	} catch (error) {
		// 409 MX_CONFLICT asks the caller to confirm and retry with replaceMx.
		if (error instanceof MxConflictError) {
			return NextResponse.json(
				{ code: error.code, error: error.message, records: error.records },
				{ status: 409 }
			);
		}
		const message =
			error instanceof Error ? error.message : "Failed to set up DNS record";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
