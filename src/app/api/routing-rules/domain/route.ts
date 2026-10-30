import { getDb } from "@/db";
import { routingRules } from "@/db/schema";
import { requireSessionUser } from "@/lib/api/auth";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import {
	assertAdminRuleMailbox,
	getAdminDomain,
	listAdminDomainMailboxes,
	listAdminRoutingDomains,
	listDomainRules,
	toRuleColumns,
} from "@/lib/domains/routing-rules";
import { newId } from "@/lib/ids";
import { domainRoutingRuleSchema } from "@/lib/validators";

export async function GET(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	const { user } = auth;
	const { searchParams } = new URL(request.url);
	const db = getDb(env);
	if (searchParams.get("list") === "true") {
		const domains = await listAdminRoutingDomains(db, user);
		if (!domains) {
			return Response.json(
				{ error: "Domain management permission is required" },
				{ status: 403 }
			);
		}
		return Response.json({ domains });
	}
	const domainId = searchParams.get("domainId");
	if (!domainId) {
		return Response.json({ error: "domainId is required" }, { status: 400 });
	}

	const adminDomain = await getAdminDomain(db, user, domainId);
	if (!adminDomain) {
		return Response.json(
			{ error: "Domain management permission is required" },
			{ status: 403 }
		);
	}

	return Response.json({
		mailboxes: await listAdminDomainMailboxes(db, domainId),
		rules: await listDomainRules(db, domainId),
	});
}

export async function POST(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	const { user } = auth;
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const parsed = domainRoutingRuleSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const db = getDb(env);
	const adminDomain = await getAdminDomain(db, user, parsed.data.domainId);
	if (!adminDomain) {
		return Response.json(
			{ error: "Domain management permission is required" },
			{ status: 403 }
		);
	}

	const destinationAllowed = parsed.data.mailboxId
		? await assertAdminRuleMailbox(
				db,
				parsed.data.mailboxId,
				parsed.data.domainId
			)
		: true;
	if (!destinationAllowed) {
		return Response.json(
			{ error: "Mailbox access is required for the destination" },
			{ status: 403 }
		);
	}

	const id = newId("rule");
	await db.insert(routingRules).values({
		domainId: parsed.data.domainId,
		id,
		userId: user.id,
		...toRuleColumns(parsed.data),
	});

	return Response.json({ id });
}
