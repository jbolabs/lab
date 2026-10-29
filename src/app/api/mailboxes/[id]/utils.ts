import { eq } from "drizzle-orm";

import type { getDb } from "@/db";
import { domains, mailboxes, users } from "@/db/schema";

import type { MailboxUpdateValues } from "./types";

type Db = ReturnType<typeof getDb>;

export function selectMailboxForUser(
	db: Db,
	userId: string,
	mailboxId: string
) {
	return db
		.select({
			autoReplyBody: mailboxes.autoReplyBody,
			autoReplyEnabled: mailboxes.autoReplyEnabled,
			autoReplySubject: mailboxes.autoReplySubject,
			avatarKey: mailboxes.avatarKey,
			createdAt: mailboxes.createdAt,
			disabled: mailboxes.disabled,
			displayName: mailboxes.displayName,
			domainId: mailboxes.domainId,
			hostname: domains.hostname,
			id: mailboxes.id,
			localPart: mailboxes.localPart,
			ownerAvatarKey: users.avatarKey,
			ownerName: users.name,
			signature: mailboxes.signature,
			type: mailboxes.type,
			useAllDomains: mailboxes.useAllDomains,
			userId: mailboxes.userId,
		})
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.innerJoin(users, eq(mailboxes.userId, users.id))
		.where(eq(mailboxes.id, mailboxId))
		.limit(1);
}

export function getMailboxUpdateValues(
	input: MailboxUpdateValues
): MailboxUpdateValues {
	const values: MailboxUpdateValues = {};
	if ("displayName" in input) {
		values.displayName = input.displayName?.trim() || null;
	}
	if ("signature" in input) {
		values.signature = input.signature?.trim() || null;
	}
	if ("autoReplyEnabled" in input) {
		values.autoReplyEnabled = input.autoReplyEnabled;
	}
	if ("autoReplySubject" in input) {
		values.autoReplySubject = input.autoReplySubject?.trim() || "Out of office";
	}
	if ("autoReplyBody" in input) {
		values.autoReplyBody = input.autoReplyBody?.trim() || "";
	}
	if ("useAllDomains" in input) {
		values.useAllDomains = input.useAllDomains;
	}
	return values;
}
