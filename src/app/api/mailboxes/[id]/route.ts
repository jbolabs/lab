import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { mailboxes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";
import {
	ensureMailboxDomainRouting,
	removeMailboxDomainRouting,
} from "@/lib/mailboxes/domain-addresses";
import {
	isPrimaryMailbox,
	tracksAccountIdentity,
} from "@/lib/profile/identity-utils";
import { syncPersonalIdentity } from "@/lib/profile/sync";
import { updateMailboxSchema } from "@/lib/validators";

import type { MailboxRouteParams } from "./types";
import { getMailboxUpdateValues, selectMailboxForUser } from "./utils";

export async function GET(request: Request, { params }: MailboxRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, id);
	if (!access?.canRead) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}
	const [mailbox] = await selectMailboxForUser(db, user.id, id);

	if (!mailbox) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}
	const { avatarKey, ownerName, ownerAvatarKey, ...mailboxDetails } = mailbox;
	const identity = tracksAccountIdentity(mailbox, user.email);

	return Response.json({
		mailbox: {
			...mailboxDetails,
			displayName: identity ? ownerName : mailbox.displayName,
			hasAvatar: identity ? !!ownerAvatarKey : !!avatarKey,
			isPrimary: isPrimaryMailbox(mailbox, user.email),
			permission: access.permission,
		},
	});
}

export async function PATCH(request: Request, { params }: MailboxRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const parsed = updateMailboxSchema.safeParse(await request.json());

	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, id);
	const [existing] = await selectMailboxForUser(db, user.id, id);

	if (!existing || !access?.canManage) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}

	const updateValues = getMailboxUpdateValues(parsed.data);
	// Only the primary mailbox carries the account name; renaming any other
	// mailbox writes to that mailbox alone.
	if (
		tracksAccountIdentity(existing, user.email) &&
		"displayName" in parsed.data
	) {
		const name = parsed.data.displayName?.trim();
		if (!name) {
			return Response.json(
				{ error: "A valid account name is required" },
				{ status: 400 }
			);
		}
		await syncPersonalIdentity(db, {
			avatarKey: existing.ownerAvatarKey,
			name,
			userId: existing.userId,
		});
		delete updateValues.displayName;
	}
	if (parsed.data.useAllDomains === true) {
		try {
			await ensureMailboxDomainRouting(env, db, {
				domainId: existing.domainId,
				id: existing.id,
				localPart: existing.localPart,
				useAllDomains: true,
			});
		} catch (error) {
			console.error("ensureMailboxDomainRouting", error);
			return Response.json(
				{
					error:
						"Failed to configure inbound routing for all domains. Please try saving again.",
				},
				{ status: 502 }
			);
		}
	}
	if (Object.keys(updateValues).length > 0) {
		await db.update(mailboxes).set(updateValues).where(eq(mailboxes.id, id));
	}

	const [mailbox] = await selectMailboxForUser(db, user.id, id);
	const { avatarKey, ownerName, ownerAvatarKey, ...mailboxDetails } = mailbox;
	const identity = tracksAccountIdentity(mailbox, user.email);

	return Response.json({
		mailbox: {
			...mailboxDetails,
			displayName: identity ? ownerName : mailbox.displayName,
			hasAvatar: identity ? !!ownerAvatarKey : !!avatarKey,
			isPrimary: isPrimaryMailbox(mailbox, user.email),
			permission: access.permission,
		},
	});
}

export async function DELETE(request: Request, { params }: MailboxRouteParams) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const db = getDb(env);
	const [mailbox] = await db
		.select()
		.from(mailboxes)
		.where(eq(mailboxes.id, id))
		.limit(1);
	if (!mailbox) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}

	let allowed = mailbox.userId === user.id && user.canManageMailboxes;
	if (!allowed && user.role === "admin") {
		const [owner] = await db
			.select({ createdByUserId: users.createdByUserId })
			.from(users)
			.where(eq(users.id, mailbox.userId))
			.limit(1);
		allowed = mailbox.userId === user.id || owner?.createdByUserId === user.id;
	}
	if (!allowed) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}

	try {
		await removeMailboxDomainRouting(env, db, {
			domainId: mailbox.domainId,
			id: mailbox.id,
			localPart: mailbox.localPart,
			useAllDomains: mailbox.useAllDomains,
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to remove Cloudflare routing rule";
		return Response.json({ error: message }, { status: 502 });
	}

	await db.delete(mailboxes).where(eq(mailboxes.id, id));
	return Response.json({ ok: true });
}
