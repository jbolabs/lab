import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "@/db";
import { domains, mailboxAccess, mailboxes } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/types";

import type { MailboxAccessLevel, MailboxPermission } from "./types";

const permissionRank: Record<MailboxPermission, number> = {
	full_access: 4,
	read_only: 1,
	send_as: 3,
	send_on_behalf: 2,
};

export function hasMailboxPermission(
	permission: MailboxPermission,
	required: MailboxPermission
): boolean {
	return permissionRank[permission] >= permissionRank[required];
}

function buildAccess(
	mailbox: MailboxAccessLevel["mailbox"],
	permission: MailboxPermission,
	isOwner: boolean
): MailboxAccessLevel {
	return {
		canManage: hasMailboxPermission(permission, "full_access"),
		canRead: hasMailboxPermission(permission, "read_only"),
		canSendAs: hasMailboxPermission(permission, "send_as"),
		canSendOnBehalf: hasMailboxPermission(permission, "send_on_behalf"),
		isOwner,
		mailbox,
		permission,
	};
}

export async function getMailboxAccessLevel(
	db: AppDatabase,
	user: Pick<SessionUser, "id" | "role">,
	mailboxId: string
): Promise<MailboxAccessLevel | null> {
	const [mailbox] = await db
		.select()
		.from(mailboxes)
		.where(eq(mailboxes.id, mailboxId))
		.limit(1);
	if (!mailbox || mailbox.disabled) {
		return null;
	}

	const isOwner = mailbox.userId === user.id;
	if (isOwner) {
		return buildAccess(mailbox, "full_access", true);
	}
	if (mailbox.type !== "shared") {
		return null;
	}

	const [delegatedAccess] = await db
		.select({ permission: mailboxAccess.permission })
		.from(mailboxAccess)
		.where(
			and(
				eq(mailboxAccess.mailboxId, mailbox.id),
				eq(mailboxAccess.userId, user.id)
			)
		)
		.limit(1);
	if (delegatedAccess) {
		return buildAccess(mailbox, delegatedAccess.permission, false);
	}

	return null;
}

export async function listAccessibleMailboxes(
	db: AppDatabase,
	user: Pick<SessionUser, "id" | "email" | "role">
) {
	const ownedRows = await db
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
			signature: mailboxes.signature,
			type: mailboxes.type,
			useAllDomains: mailboxes.useAllDomains,
			userId: mailboxes.userId,
		})
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.where(and(eq(mailboxes.userId, user.id), eq(mailboxes.disabled, false)));
	const owned = ownedRows.map((row) => {
		const { avatarKey, ...mailbox } = row;
		return {
			...mailbox,
			hasAvatar: !!avatarKey,
			isPrimary: `${row.localPart}@${row.hostname}` === user.email,
			permission: "full_access" as MailboxPermission,
		};
	});

	const sharedRows = await db
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
			permission: mailboxAccess.permission,
			signature: mailboxes.signature,
			type: mailboxes.type,
			useAllDomains: mailboxes.useAllDomains,
			userId: mailboxes.userId,
		})
		.from(mailboxAccess)
		.innerJoin(mailboxes, eq(mailboxAccess.mailboxId, mailboxes.id))
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.where(
			and(
				eq(mailboxAccess.userId, user.id),
				eq(mailboxes.type, "shared"),
				eq(mailboxes.disabled, false)
			)
		);
	const shared = sharedRows.map((row) => {
		const { avatarKey, ...mailbox } = row;
		return {
			...mailbox,
			hasAvatar: !!avatarKey,
			isPrimary: false,
		};
	});

	return [...owned, ...shared];
}

export async function listAccessibleMailboxIds(
	db: AppDatabase,
	user: Pick<SessionUser, "id" | "email" | "role">
) {
	const rows = await listAccessibleMailboxes(db, user);
	return rows.map((row) => row.id);
}
