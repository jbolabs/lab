import { and, eq } from "drizzle-orm";

import { requireTeamSharingAdmin } from "@/app/api/accounts/utils";
import { getDb } from "@/db";
import { mailboxAccess, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { mailboxAccessSchema } from "@/lib/validators";

import type { MailboxAccessRouteParams } from "./types";
import { getSharedMailboxForAdmin } from "./utils";

export async function GET(
	request: Request,
	{ params }: MailboxAccessRouteParams
) {
	const access = await requireTeamSharingAdmin(request);
	if (access.error) {
		return access.error;
	}
	const { id } = await params;
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForAdmin(db, id, access.user.id);
	if (!mailbox) {
		return Response.json({ error: "Shared inbox not found" }, { status: 404 });
	}

	const [members, availableUsers] = await Promise.all([
		db
			.select({
				createdAt: mailboxAccess.createdAt,
				id: mailboxAccess.id,
				permission: mailboxAccess.permission,
				userEmail: users.email,
				userId: mailboxAccess.userId,
				userName: users.name,
			})
			.from(mailboxAccess)
			.innerJoin(users, eq(mailboxAccess.userId, users.id))
			.where(eq(mailboxAccess.mailboxId, id)),
		db
			.select({
				email: users.email,
				id: users.id,
				name: users.name,
				role: users.role,
			})
			.from(users)
			.where(
				and(
					eq(users.createdByUserId, access.user.id),
					eq(users.disabled, false)
				)
			),
	]);

	return Response.json({ availableUsers, members });
}

export async function POST(
	request: Request,
	{ params }: MailboxAccessRouteParams
) {
	const access = await requireTeamSharingAdmin(request);
	if (access.error) {
		return access.error;
	}
	const parsed = mailboxAccessSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: "Choose a valid account" }, { status: 400 });
	}
	const { id } = await params;
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForAdmin(db, id, access.user.id);
	if (!mailbox) {
		return Response.json({ error: "Shared inbox not found" }, { status: 404 });
	}
	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(
			and(
				eq(users.id, parsed.data.userId),
				eq(users.createdByUserId, access.user.id),
				eq(users.disabled, false)
			)
		)
		.limit(1);
	if (!user) {
		return Response.json({ error: "Account not found" }, { status: 404 });
	}

	await db
		.insert(mailboxAccess)
		.values({
			createdByUserId: access.user.id,
			id: newId("mac"),
			mailboxId: id,
			permission: parsed.data.permission,
			userId: user.id,
		})
		.onConflictDoUpdate({
			set: {
				createdByUserId: access.user.id,
				permission: parsed.data.permission,
			},
			target: [mailboxAccess.mailboxId, mailboxAccess.userId],
		});
	return Response.json({ ok: true });
}

export async function DELETE(
	request: Request,
	{ params }: MailboxAccessRouteParams
) {
	const access = await requireTeamSharingAdmin(request);
	if (access.error) {
		return access.error;
	}
	const { id } = await params;
	const userId = new URL(request.url).searchParams.get("userId");
	if (!userId) {
		return Response.json({ error: "Account is required" }, { status: 400 });
	}
	const db = getDb(access.env);
	const mailbox = await getSharedMailboxForAdmin(db, id, access.user.id);
	if (!mailbox) {
		return Response.json({ error: "Shared inbox not found" }, { status: 404 });
	}
	await db
		.delete(mailboxAccess)
		.where(
			and(eq(mailboxAccess.mailboxId, id), eq(mailboxAccess.userId, userId))
		);
	return Response.json({ ok: true });
}
