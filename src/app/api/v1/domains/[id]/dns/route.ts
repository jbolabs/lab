import { NextResponse } from "next/server";

import { authenticateAdminApiKey } from "@/lib/api/admin-auth";
import { getEnv } from "@/lib/cloudflare";
import { getDomainDnsView } from "@/lib/domains/dns-view";
import { getDomainForUser } from "@/lib/domains/service";

interface Params {
	params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
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

	try {
		const dns = await getDomainDnsView(env, domain);
		return NextResponse.json({
			dns,
			domain: { ...domain, sendingEnabled: dns.sendingEnabled },
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to fetch DNS";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
