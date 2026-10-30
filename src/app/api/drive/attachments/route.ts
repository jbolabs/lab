import { eq, inArray } from "drizzle-orm";

import { chunks } from "@/app/api/drive/bulk-utils";
import { getDb } from "@/db";
import { messageAttachments, messages } from "@/db/schema";
import { authorizeDrive } from "@/lib/drive/auth";
import {
	getMailboxAccessLevel,
	hasMailboxPermission,
} from "@/lib/mailboxes/access";

const MAX_BULK = 200;

async function getPermittedAttachments(
	db: ReturnType<typeof getDb>,
	user: Parameters<typeof getMailboxAccessLevel>[1],
	ids: string[]
) {
	const batches = await Promise.all(
		chunks(ids).map((slice) =>
			db
				.select({
					id: messageAttachments.id,
					mailboxId: messages.mailboxId,
					r2Key: messageAttachments.r2Key,
					trashedAt: messageAttachments.trashedAt,
					userId: messages.userId,
				})
				.from(messageAttachments)
				.innerJoin(messages, eq(messageAttachments.messageId, messages.id))
				.where(inArray(messageAttachments.id, slice))
		)
	);
	const rows = batches.flat();
	const mailboxIds = [
		...new Set(rows.flatMap((row) => (row.mailboxId ? [row.mailboxId] : []))),
	];
	const access = await Promise.all(
		mailboxIds.map(async (id) => {
			const permission = await getMailboxAccessLevel(db, user, id);
			return [
				id,
				!!permission &&
					hasMailboxPermission(permission.permission, "send_on_behalf"),
			] as const;
		})
	);
	const permissions = new Map(access);
	const permitted = rows
		.filter((row) =>
			row.mailboxId ? permissions.get(row.mailboxId) : row.userId === user.id
		)
		.map(({ id, r2Key, trashedAt }) => ({ id, r2Key, trashedAt }));
	return { denied: rows.length - permitted.length, permitted };
}

/**
 * Trash, restore or permanently delete email attachments.
 *
 * - `trash` hides the attachment from the email and lists it in the Drive trash; it is purged after 30 days.
 * - `restore` puts it back on the email.
 * - `delete` removes the database row and the stored file for good, and only works on trashed attachments.
 *
 * The message itself is never touched. Read-only mailbox access is not enough for any of these.
 */
export async function POST(request: Request) {
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	const { env, user } = auth;
	const db = getDb(env);
	const body = (await request.json().catch(() => ({}))) as {
		action?: unknown;
		ids?: unknown;
	};
	const ids = Array.isArray(body.ids)
		? [
				...new Set(
					body.ids.filter((id): id is string => typeof id === "string")
				),
			]
		: [];
	if (
		body.action !== "trash" &&
		body.action !== "restore" &&
		body.action !== "delete"
	) {
		return Response.json({ error: "Unknown action" }, { status: 400 });
	}
	if (!ids.length || ids.length > MAX_BULK) {
		return Response.json(
			{ error: "Select between 1 and 200 attachments" },
			{ status: 400 }
		);
	}

	const { permitted, denied } = await getPermittedAttachments(db, user, ids);
	if (denied && !permitted.length) {
		return Response.json(
			{ error: "You cannot change these attachments" },
			{ status: 403 }
		);
	}

	const targets =
		body.action === "trash"
			? permitted.filter((row) => !row.trashedAt)
			: permitted.filter((row) => row.trashedAt);
	const targetIds = targets.map((row) => row.id);

	await Promise.all(
		chunks(targetIds).map((slice) =>
			body.action === "delete"
				? db
						.delete(messageAttachments)
						.where(inArray(messageAttachments.id, slice))
				: db
						.update(messageAttachments)
						.set({ trashedAt: body.action === "trash" ? new Date() : null })
						.where(inArray(messageAttachments.id, slice))
		)
	);
	if (body.action === "delete" && targets.length) {
		await env.BUCKET.delete(targets.map((row) => row.r2Key));
	}
	return Response.json({ count: targets.length, denied });
}
