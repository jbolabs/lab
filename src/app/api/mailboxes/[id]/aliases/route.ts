import { and, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { domains, mailboxAliases, mailboxes } from "@/db/schema";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import {
	deleteEmailRoutingRuleForAddress,
	ensureEmailRoutingRuleToWorker,
} from "@/lib/cloudflare-api";
import { newId } from "@/lib/ids";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";
import { createMailboxAliasSchema } from "@/lib/validators";

import type { MailboxRouteParams } from "../types";

async function getManagedMailbox(
	db: ReturnType<typeof getDb>,
	user: Awaited<ReturnType<typeof requireUser>>,
	mailboxId: string
) {
	const access = await getMailboxAccessLevel(db, user, mailboxId);
	if (!access?.canManage) {
		return null;
	}
	const [mailbox] = await db
		.select({
			domainId: mailboxes.domainId,
			id: mailboxes.id,
			localPart: mailboxes.localPart,
		})
		.from(mailboxes)
		.where(eq(mailboxes.id, mailboxId))
		.limit(1);
	return mailbox ?? null;
}

async function getDomainOwnerId(
	db: ReturnType<typeof getDb>,
	domainId: string
) {
	const [domain] = await db
		.select({ userId: domains.userId })
		.from(domains)
		.where(eq(domains.id, domainId))
		.limit(1);
	return domain?.userId ?? null;
}

function listMailboxAliases(db: ReturnType<typeof getDb>, mailboxId: string) {
	return db
		.select({
			createdAt: mailboxAliases.createdAt,
			domainId: mailboxAliases.domainId,
			hostname: domains.hostname,
			id: mailboxAliases.id,
			localPart: mailboxAliases.localPart,
		})
		.from(mailboxAliases)
		.innerJoin(domains, eq(mailboxAliases.domainId, domains.id))
		.where(eq(mailboxAliases.mailboxId, mailboxId));
}

export async function GET(request: Request, { params }: MailboxRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const db = getDb(env);
	const mailbox = await getManagedMailbox(db, user, id);
	if (!mailbox) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}

	const ownerId = await getDomainOwnerId(db, mailbox.domainId);
	const [aliases, availableDomains] = await Promise.all([
		listMailboxAliases(db, id),
		ownerId
			? db
					.select({ hostname: domains.hostname, id: domains.id })
					.from(domains)
					.where(and(eq(domains.userId, ownerId), eq(domains.status, "active")))
			: Promise.resolve([]),
	]);

	return Response.json({ aliases, availableDomains });
}

export async function POST(request: Request, { params }: MailboxRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const parsed = createMailboxAliasSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json(
			{ error: "Enter a valid alias username and domain" },
			{ status: 400 }
		);
	}

	const db = getDb(env);
	const mailbox = await getManagedMailbox(db, user, id);
	if (!mailbox) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}

	const ownerId = await getDomainOwnerId(db, mailbox.domainId);
	const [domain] = ownerId
		? await db
				.select({
					hostname: domains.hostname,
					id: domains.id,
					zoneId: domains.zoneId,
				})
				.from(domains)
				.where(
					and(
						eq(domains.id, parsed.data.domainId),
						eq(domains.userId, ownerId),
						eq(domains.status, "active")
					)
				)
				.limit(1)
		: [];
	if (!domain) {
		return Response.json({ error: "Domain not found" }, { status: 404 });
	}

	const { localPart } = parsed.data;
	const [existingMailbox] = await db
		.select({ id: mailboxes.id })
		.from(mailboxes)
		.where(
			and(eq(mailboxes.domainId, domain.id), eq(mailboxes.localPart, localPart))
		)
		.limit(1);
	if (existingMailbox) {
		return Response.json(
			{ error: "A mailbox already uses this address" },
			{ status: 409 }
		);
	}
	const [existingAlias] = await db
		.select({ id: mailboxAliases.id })
		.from(mailboxAliases)
		.where(
			and(
				eq(mailboxAliases.domainId, domain.id),
				eq(mailboxAliases.localPart, localPart)
			)
		)
		.limit(1);
	if (existingAlias) {
		return Response.json(
			{ error: "An alias already uses this address" },
			{ status: 409 }
		);
	}

	const aliasId = newId("als");
	const inserted = await db
		.insert(mailboxAliases)
		.values({
			domainId: domain.id,
			id: aliasId,
			localPart,
			mailboxId: id,
		})
		.onConflictDoNothing()
		.returning({ id: mailboxAliases.id });
	if (inserted.length === 0) {
		return Response.json(
			{ error: "An alias already uses this address" },
			{ status: 409 }
		);
	}

	try {
		await ensureEmailRoutingRuleToWorker(
			env,
			domain.zoneId,
			`${localPart}@${domain.hostname}`
		);
	} catch (error) {
		console.error("ensureEmailRoutingRuleToWorker", error);
		await db.delete(mailboxAliases).where(eq(mailboxAliases.id, aliasId));
		return Response.json(
			{
				error:
					"Failed to create the Cloudflare Email Routing rule for this alias. Please try again.",
			},
			{ status: 502 }
		);
	}

	const aliases = await listMailboxAliases(db, id);
	return Response.json({ aliases });
}

export async function DELETE(request: Request, { params }: MailboxRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const aliasId = new URL(request.url).searchParams.get("aliasId");
	if (!aliasId) {
		return Response.json({ error: "Alias is required" }, { status: 400 });
	}

	const db = getDb(env);
	const mailbox = await getManagedMailbox(db, user, id);
	if (!mailbox) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}

	const [alias] = await db
		.select({
			domainId: mailboxAliases.domainId,
			hostname: domains.hostname,
			id: mailboxAliases.id,
			localPart: mailboxAliases.localPart,
			zoneId: domains.zoneId,
		})
		.from(mailboxAliases)
		.innerJoin(domains, eq(mailboxAliases.domainId, domains.id))
		.where(
			and(eq(mailboxAliases.id, aliasId), eq(mailboxAliases.mailboxId, id))
		)
		.limit(1);
	if (!alias) {
		return Response.json({ error: "Alias not found" }, { status: 404 });
	}

	// Keep the Cloudflare rule when the address still resolves through a
	// use-all-domains mailbox or another mailbox's alias on the same address.
	const [domainAliasMailbox] = await db
		.select({ id: mailboxes.id })
		.from(mailboxes)
		.where(
			and(
				eq(mailboxes.localPart, alias.localPart),
				eq(mailboxes.useAllDomains, true),
				eq(mailboxes.disabled, false),
				ne(mailboxes.id, id)
			)
		)
		.limit(1);

	if (!domainAliasMailbox) {
		try {
			await deleteEmailRoutingRuleForAddress(
				env,
				alias.zoneId,
				`${alias.localPart}@${alias.hostname}`
			);
		} catch (error) {
			console.error("deleteEmailRoutingRuleForAddress", error);
			return Response.json(
				{
					error:
						"Failed to remove the Cloudflare Email Routing rule for this alias. Please try again.",
				},
				{ status: 502 }
			);
		}
	}

	await db.delete(mailboxAliases).where(eq(mailboxAliases.id, aliasId));
	const aliases = await listMailboxAliases(db, id);
	return Response.json({ aliases });
}
