import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import type { getDb } from "@/db";
import { domains, mailboxes, users } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";

type Db = ReturnType<typeof getDb>;

export function listAccountsForAdmin(db: Db) {
	return db
		.select({
			avatarKey: users.avatarKey,
			canManageDomains: users.canManageDomains,
			canManageMailboxes: users.canManageMailboxes,
			canManageUsers: users.canManageUsers,
			createdAt: users.createdAt,
			deletedAt: users.deletedAt,
			disabled: users.disabled,
			email: users.email,
			id: users.id,
			isPrimaryAdmin: users.isPrimaryAdmin,
			lastSignInAt: users.lastSignInAt,
			name: users.name,
			resetEmail: users.resetEmail,
			role: users.role,
		})
		.from(users)
		.orderBy(desc(users.createdAt));
}

export async function getDomainForAdmin(
	db: Db,
	adminUserId: string,
	domainId: string
) {
	const [domain] = await db
		.select()
		.from(domains)
		.where(and(eq(domains.id, domainId), eq(domains.userId, adminUserId)))
		.limit(1);
	return domain ?? null;
}

export async function getExistingMailbox(
	db: Db,
	domainId: string,
	localPart: string
) {
	const [mailbox] = await db
		.select()
		.from(mailboxes)
		.where(
			and(eq(mailboxes.domainId, domainId), eq(mailboxes.localPart, localPart))
		)
		.limit(1);
	return mailbox ?? null;
}

export function accountListItemFromUser(user: {
	id: string;
	email: string;
	name: string;
	resetEmail: string | null;
	role: "admin" | "user";
	isPrimaryAdmin?: boolean;
	disabled: boolean;
	avatarKey?: string | null;
	canManageMailboxes?: boolean;
	canManageDomains?: boolean;
	canManageUsers?: boolean;
	createdAt: Date;
	lastSignInAt?: Date | null;
	deletedAt?: Date | null;
}) {
	return {
		canManageDomains: !!user.canManageDomains,
		canManageMailboxes: !!user.canManageMailboxes,
		canManageUsers: !!user.canManageUsers,
		createdAt: user.createdAt,
		deletedAt: user.deletedAt ?? null,
		disabled: user.disabled,
		email: user.email,
		hasAvatar: !!user.avatarKey,
		id: user.id,
		isPrimaryAdmin: !!user.isPrimaryAdmin,
		lastSignInAt: user.lastSignInAt ?? null,
		name: user.name,
		resetEmail: user.resetEmail,
		role: user.role,
	};
}

/** Admin session for managing shared inboxes. */

export async function requireTeamAdmin(request: Request) {
	const env = getEnv();
	try {
		const user = await requireUser(env, request);
		assertAdmin(user);
		return { env, error: null, user };
	} catch {
		return {
			env,
			error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
			user: null,
		};
	}
}

export { requireTeamAdmin as requireTeamSharingAdmin };
