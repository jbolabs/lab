import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { routingRules } from "@/db/schema";
import { requireSessionUser } from "@/lib/api/auth";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import {
	assertAdminRuleMailbox,
	getAdminDomain,
	toRuleColumns,
} from "@/lib/domains/routing-rules";
import { domainRoutingRuleSchema } from "@/lib/validators";

import type { DomainRoutingRuleRouteParams } from "./types";

/** Loads a domain-scope rule the caller is allowed to administer. */
async function loadRule(request: Request, id: string) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return { error: auth.error } as const;
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return {
			error: Response.json({ error: "Invalid origin" }, { status: 403 }),
		} as const;
	}
	const { user } = auth;
	const db = getDb(env);
	const [rule] = await db
		.select()
		.from(routingRules)
		.where(and(eq(routingRules.id, id), eq(routingRules.scope, "domain")))
		.limit(1);
	if (!rule) {
		return {
			error: Response.json({ error: "Rule not found" }, { status: 404 }),
		} as const;
	}

	const adminDomain = await getAdminDomain(db, user, rule.domainId);
	if (!adminDomain) {
		return {
			error: Response.json(
				{ error: "Domain management permission is required" },
				{ status: 403 }
			),
		} as const;
	}

	return { adminDomain, db, env, error: null, rule, user } as const;
}

export async function PATCH(
	request: Request,
	{ params }: DomainRoutingRuleRouteParams
) {
	const { id } = await params;
	const loaded = await loadRule(request, id);
	if (loaded.error) {
		return loaded.error;
	}

	const body = (await request.json()) as Record<string, unknown>;
	// The rule's own domain always wins, so a request cannot move a rule to another domain.
	const parsed = domainRoutingRuleSchema.safeParse({
		...body,
		domainId: loaded.rule.domainId,
	});
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const destinationAllowed = parsed.data.mailboxId
		? await assertAdminRuleMailbox(
				loaded.db,
				parsed.data.mailboxId,
				loaded.rule.domainId
			)
		: true;
	if (!destinationAllowed) {
		return Response.json(
			{ error: "Mailbox access is required for the destination" },
			{ status: 403 }
		);
	}

	await loaded.db
		.update(routingRules)
		.set(toRuleColumns(parsed.data))
		.where(eq(routingRules.id, id));
	return Response.json({ ok: true });
}

export async function DELETE(
	request: Request,
	{ params }: DomainRoutingRuleRouteParams
) {
	const { id } = await params;
	const loaded = await loadRule(request, id);
	if (loaded.error) {
		return loaded.error;
	}

	await loaded.db.delete(routingRules).where(eq(routingRules.id, id));
	return Response.json({ ok: true });
}
