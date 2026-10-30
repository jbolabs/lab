import { canManageDomains } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import type { DnsStatusSummary } from "@/lib/dns-status";
import { summariseDomainDns } from "@/lib/domains/dns-view";
import { getDomainProvisioningError } from "@/lib/domains/errors";
import { addDomainForUser, listUserDomains } from "@/lib/domains/service";
import { addDomainSchema } from "@/lib/validators";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	const domainOwnerId =
		user.canManageMailboxes && user.createdByUserId
			? user.createdByUserId
			: user.id;
	const domains = await listUserDomains(env, domainOwnerId);

	const includeDns =
		new URL(request.url).searchParams.get("includeDns") === "true";

	const dns: Record<string, DnsStatusSummary> = {};
	let domainViews = domains;
	if (includeDns) {
		const results = await Promise.allSettled(
			domains.map(async (domain) => {
				const { summary, sendingEnabled } = await summariseDomainDns(
					env,
					domain
				);
				return { id: domain.id, sendingEnabled, summary };
			})
		);
		const sendingEnabledByDomain = new Map<string, boolean>();
		for (const r of results) {
			if (r.status === "fulfilled") {
				dns[r.value.id] = r.value.summary;
				sendingEnabledByDomain.set(r.value.id, r.value.sendingEnabled);
			}
		}
		domainViews = domains.map((domain) => ({
			...domain,
			sendingEnabled:
				sendingEnabledByDomain.get(domain.id) ?? domain.sendingEnabled,
		}));
	}

	return Response.json({
		dns: includeDns ? dns : undefined,
		domains: domainViews,
	});
}

export async function POST(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!canManageDomains(user)) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const parsed = addDomainSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	try {
		const result = await addDomainForUser(env, user.id, parsed.data.hostname, {
			enableRouting: parsed.data.enableRouting,
			enableSending: parsed.data.enableSending,
			receivingProvider: parsed.data.receivingProvider,
			replaceMxRecords: parsed.data.replaceMxRecords,
			sendingProvider: parsed.data.sendingProvider,
			skipDns: parsed.data.skipDns,
		});
		return Response.json(result);
	} catch (error) {
		const failure = getDomainProvisioningError(error, "Failed to add domain");
		return Response.json(
			{ code: failure.code, error: failure.message },
			{ status: failure.status }
		);
	}
}
