import { NextResponse } from "next/server";

import { authenticateAdminApiKey } from "@/lib/api/admin-auth";
import { getEnv } from "@/lib/cloudflare";
import type { DnsStatusSummary } from "@/lib/dns-status";
import { getDomainDnsView, summariseDomainDns } from "@/lib/domains/dns-view";
import { getDomainProvisioningError } from "@/lib/domains/errors";
import { addDomainForUser, listUserDomains } from "@/lib/domains/service";
import { addDomainSchema } from "@/lib/validators";

function ownerId(user: {
	id: string;
	canManageMailboxes: boolean;
	createdByUserId: string | null;
}) {
	return user.canManageMailboxes && user.createdByUserId
		? user.createdByUserId
		: user.id;
}

export async function GET(request: Request) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "domains");
	if (!auth) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const domains = await listUserDomains(env, ownerId(auth.user));
	const results = await Promise.allSettled(
		domains.map((domain) => summariseDomainDns(env, domain))
	);

	const dns: Record<string, DnsStatusSummary> = {};
	const domainViews = domains.map((domain, index) => {
		const result = results[index];
		if (result.status !== "fulfilled") {
			return domain;
		}
		dns[domain.id] = result.value.summary;
		return { ...domain, sendingEnabled: result.value.sendingEnabled };
	});

	return NextResponse.json({ dns, domains: domainViews });
}

export async function POST(request: Request) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "domains");
	if (!auth) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = addDomainSchema.safeParse(
		await request.json().catch(() => null)
	);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.flatten() },
			{ status: 400 }
		);
	}

	try {
		const result = await addDomainForUser(
			env,
			auth.userId,
			parsed.data.hostname,
			{
				enableRouting: parsed.data.enableRouting,
				enableSending: parsed.data.enableSending,
				receivingProvider: parsed.data.receivingProvider,
				replaceMxRecords: parsed.data.replaceMxRecords,
				sendingProvider: parsed.data.sendingProvider,
			}
		);
		let { dns } = result;
		try {
			dns = await getDomainDnsView(env, result.domain);
		} catch (error) {
			console.warn(
				"v1 addDomain: failed to read DNS after provisioning",
				error
			);
		}
		return NextResponse.json({ ...result, dns });
	} catch (error) {
		const failure = getDomainProvisioningError(error, "Failed to add domain");
		return NextResponse.json(
			{ code: failure.code, error: failure.message },
			{ status: failure.status }
		);
	}
}
