import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "@/db";
import { domains, mailboxes } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/types";
import { ensureEmailRoutingRuleToWorker } from "@/lib/cloudflare-api";
import { newId } from "@/lib/ids";
import { listAccessibleMailboxes } from "@/lib/mailboxes/access";
import { ensureMailboxDomainRouting } from "@/lib/mailboxes/domain-addresses";

export async function ensurePersonalMailbox(
	env: CloudflareEnv,
	db: AppDatabase,
	user: SessionUser
) {
	const current = await listAccessibleMailboxes(db, user);
	if (
		current.some(
			(mailbox) => mailbox.userId === user.id && mailbox.type === "personal"
		)
	) {
		return current;
	}

	const [localPart, hostname] = user.email.toLowerCase().split("@");
	if (!localPart || !hostname) {
		return current;
	}
	const [domain] = await db
		.select()
		.from(domains)
		.where(eq(domains.hostname, hostname))
		.limit(1);
	if (!domain) {
		return current;
	}

	const [existing] = await db
		.select({ id: mailboxes.id })
		.from(mailboxes)
		.where(
			and(eq(mailboxes.domainId, domain.id), eq(mailboxes.localPart, localPart))
		)
		.limit(1);
	if (existing) {
		return current;
	}

	try {
		await ensureEmailRoutingRuleToWorker(env, domain.zoneId, user.email);
	} catch {
		// Mailbox visibility should not depend on routing API availability.
	}

	const id = newId("mbx");
	try {
		await db.insert(mailboxes).values({
			displayName: user.name || localPart,
			domainId: domain.id,
			id,
			localPart,
			type: "personal",
			userId: user.id,
		});
	} catch {
		return current;
	}
	try {
		await ensureMailboxDomainRouting(env, db, {
			domainId: domain.id,
			id,
			localPart,
			useAllDomains: true,
		});
	} catch {
		// Mailbox visibility should not depend on routing API availability.
	}

	return listAccessibleMailboxes(db, user);
}
