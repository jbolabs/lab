import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { AppDatabase } from "@/db";
import { domains, mailboxes, routingRules } from "@/db/schema";
import { canManageDomains } from "@/lib/auth/admin";
import type { SessionUser } from "@/lib/auth/types";
import {
	getMailboxAccessLevel,
	listAccessibleMailboxes,
} from "@/lib/mailboxes/access";

export async function listDomainRules(db: AppDatabase, domainId: string) {
	return await db
		.select()
		.from(routingRules)
		.where(
			and(eq(routingRules.domainId, domainId), eq(routingRules.scope, "domain"))
		)
		.orderBy(desc(routingRules.priority), asc(routingRules.createdAt));
}

export async function getManagedDomainMailbox(
	db: AppDatabase,
	user: Pick<SessionUser, "id" | "email" | "role">,
	mailboxId: string,
	domainId: string
) {
	const access = await getMailboxAccessLevel(db, user, mailboxId);
	if (!access?.canManage || access.mailbox.domainId !== domainId) {
		return null;
	}
	return access.mailbox;
}

export async function listManagedDomainMailboxes(
	db: AppDatabase,
	user: Pick<SessionUser, "id" | "email" | "role">,
	domainId: string
) {
	const accessible = await listAccessibleMailboxes(db, user);
	return accessible
		.filter(
			(mailbox) =>
				mailbox.domainId === domainId && mailbox.permission === "full_access"
		)
		.map(({ id, localPart, displayName, disabled }) => ({
			disabled,
			displayName,
			id,
			localPart,
		}))
		.toSorted((a, b) => a.localPart.localeCompare(b.localPart));
}

export async function listAdminRoutingDomains(
	db: AppDatabase,
	user: Pick<
		SessionUser,
		"id" | "role" | "isPrimaryAdmin" | "canManageDomains" | "createdByUserId"
	>
) {
	if (!canManageDomains(user)) {
		return null;
	}
	const ownerIds =
		!user.isPrimaryAdmin && user.createdByUserId
			? [user.id, user.createdByUserId]
			: [user.id];
	return await db
		.select()
		.from(domains)
		.where(inArray(domains.userId, ownerIds))
		.orderBy(asc(domains.hostname));
}

export async function getAdminDomain(
	db: AppDatabase,
	user: Pick<
		SessionUser,
		"id" | "role" | "isPrimaryAdmin" | "canManageDomains" | "createdByUserId"
	>,
	domainId: string
) {
	if (!canManageDomains(user)) {
		return null;
	}
	const ownerIds =
		!user.isPrimaryAdmin && user.createdByUserId
			? [user.id, user.createdByUserId]
			: [user.id];
	const [domain] = await db
		.select()
		.from(domains)
		.where(and(eq(domains.id, domainId), inArray(domains.userId, ownerIds)))
		.limit(1);
	return domain ?? null;
}

export async function listAdminDomainMailboxes(
	db: AppDatabase,
	domainId: string
) {
	return await db
		.select({
			disabled: mailboxes.disabled,
			displayName: mailboxes.displayName,
			id: mailboxes.id,
			localPart: mailboxes.localPart,
		})
		.from(mailboxes)
		.where(eq(mailboxes.domainId, domainId))
		.orderBy(asc(mailboxes.localPart));
}

export async function assertAdminRuleMailbox(
	db: AppDatabase,
	mailboxId: string,
	domainId: string
): Promise<boolean> {
	const [mailbox] = await db
		.select({ id: mailboxes.id })
		.from(mailboxes)
		.where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.domainId, domainId)))
		.limit(1);
	return !!mailbox;
}

/** A rule can deliver only to an inbox that the caller can fully manage. */
export async function assertRuleMailbox(
	db: AppDatabase,
	user: Pick<SessionUser, "id" | "email" | "role">,
	mailboxId: string,
	domainId: string
): Promise<boolean> {
	return !!(await getManagedDomainMailbox(db, user, mailboxId, domainId));
}

export interface DomainRuleInput {
	domainId: string;
	name?: string | null;
	enabled: boolean;
	matchField: "recipient" | "sender" | "title" | "content";
	matchOperator: "contains" | "exact" | "starts_with" | "ends_with" | "regex";
	matchValue: string;
	action: "store" | "forward" | "reject";
	mailboxId?: string | null;
	forwardTo?: string | null;
	keepCopy: boolean;
	rejectReason?: string | null;
	priority: number;
}

export function toRuleColumns(input: DomainRuleInput) {
	return {
		action: input.action,
		enabled: input.enabled,
		folderId: null,
		forwardTo:
			input.action === "forward" ? (input.forwardTo?.trim() ?? null) : null,
		keepCopy: input.action === "forward" ? input.keepCopy : false,
		mailboxId: input.action === "reject" ? null : (input.mailboxId ?? null),
		matchField: input.matchField,
		matchOperator: input.matchOperator,
		matchValue: input.matchValue,
		name: input.name?.trim() || null,
		pattern: input.matchValue,
		priority: input.priority,
		rejectReason:
			input.action === "reject" ? input.rejectReason?.trim() || null : null,
		scope: "domain" as const,
	};
}
