import { eq } from "drizzle-orm";

import { avatarKeyFor } from "@/app/api/profile/avatar/utils";
import { getDb } from "@/db";
import { domains, mailboxes, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/cookies";
import {
	getAvatarImageResponse,
	getOptimizedAvatarFiles,
	storeAvatarImages,
} from "@/lib/avatar-images";
import { getEnv } from "@/lib/cloudflare";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";
import { tracksAccountIdentity } from "@/lib/profile/identity-utils";
import { syncPersonalIdentity } from "@/lib/profile/sync";

import type { MailboxAvatarRouteParams } from "./types";
import { mailboxAvatarKeyFor } from "./utils";

export async function GET(
	request: Request,
	{ params }: MailboxAvatarRouteParams
) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, id);
	if (!access?.canRead) {
		return new Response("Not found", { status: 404 });
	}

	const [mailbox] = await db
		.select({
			avatarKey: mailboxes.avatarKey,
			hostname: domains.hostname,
			localPart: mailboxes.localPart,
			ownerAvatarKey: users.avatarKey,
			ownerEmail: users.email,
			type: mailboxes.type,
		})
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.innerJoin(users, eq(mailboxes.userId, users.id))
		.where(eq(mailboxes.id, id))
		.limit(1);
	const avatarKey =
		mailbox && tracksAccountIdentity(mailbox, mailbox.ownerEmail)
			? mailbox.ownerAvatarKey
			: mailbox?.avatarKey;
	if (!avatarKey) {
		return new Response("Not found", { status: 404 });
	}

	return getAvatarImageResponse(request, env.BUCKET, avatarKey);
}

export async function POST(
	request: Request,
	{ params }: MailboxAvatarRouteParams
) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, id);
	if (!access?.canManage) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return Response.json(
			{ error: "Expected multipart form data" },
			{ status: 400 }
		);
	}
	const images = getOptimizedAvatarFiles(form);
	if (!images) {
		return Response.json(
			{ error: "A resized WebP image and preview are required" },
			{ status: 400 }
		);
	}

	const [mailbox] = await db
		.select({
			hostname: domains.hostname,
			localPart: mailboxes.localPart,
			ownerEmail: users.email,
			ownerName: users.name,
			type: mailboxes.type,
			userId: mailboxes.userId,
		})
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.innerJoin(users, eq(mailboxes.userId, users.id))
		.where(eq(mailboxes.id, id))
		.limit(1);
	if (!mailbox) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}

	// The primary mailbox shares the account avatar; every other mailbox stores its own.
	const identity = tracksAccountIdentity(mailbox, mailbox.ownerEmail);
	const key = identity ? avatarKeyFor(mailbox.userId) : mailboxAvatarKeyFor(id);
	await storeAvatarImages(env.BUCKET, key, images.full, images.preview);
	await (identity
		? syncPersonalIdentity(db, {
				avatarKey: key,
				name: mailbox.ownerName,
				userId: mailbox.userId,
			})
		: db.update(mailboxes).set({ avatarKey: key }).where(eq(mailboxes.id, id)));
	return Response.json({ ok: true });
}
