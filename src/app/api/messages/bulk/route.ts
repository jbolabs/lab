import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { folders, messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { permanentlyDeleteMessages } from "@/lib/email/permanent-delete";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";
import { createAuditLog } from "@/lib/mailboxes/audit";
import { applySpamFeedback } from "@/lib/spam/feedback";

import type { BulkMessagePayload } from "./types";
import {
	getReadValueForBulkAction,
	getStatusForBulkAction,
	isAllowedBulkMessageAction,
	isPermanentlyDeletableStatus,
} from "./utils";

export async function POST(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const payload = (await request.json()) as BulkMessagePayload;
	const messageIds = payload.messageIds?.filter(Boolean) ?? [];
	if (messageIds.length === 0 || !isAllowedBulkMessageAction(payload.action)) {
		return Response.json(
			{ error: "Invalid bulk message action" },
			{ status: 400 }
		);
	}

	const status = getStatusForBulkAction(payload.action);
	const read = getReadValueForBulkAction(payload.action);
	const db = getDb(env);
	let folderId: string | null | undefined;

	const clearsFolder = () =>
		payload.action === "spam" ||
		payload.action === "trash" ||
		payload.action === "inbox" ||
		payload.action === "archive";
	const resolveTargetFolder = async () => {
		if (payload.action === "folder") {
			if (!payload.folderId) {
				return Response.json({ error: "Folder is required" }, { status: 400 });
			}
			const [folder] = await db
				.select({ id: folders.id, mailboxId: folders.mailboxId })
				.from(folders)
				.where(eq(folders.id, payload.folderId))
				.limit(1);
			if (!folder) {
				return Response.json({ error: "Folder not found" }, { status: 404 });
			}
			const folderAccess = await getMailboxAccessLevel(
				db,
				user,
				folder.mailboxId
			);
			if (!folderAccess?.canManage) {
				return Response.json({ error: "Folder not found" }, { status: 404 });
			}
			folderId = folder.id;
		} else if (clearsFolder()) {
			folderId = null;
		}
	};
	const response1 = await resolveTargetFolder();
	if (response1 !== undefined) {
		return response1;
	}

	const buildMessageChanges = () => ({
		...(status ? { status } : {}),
		...(read === null ? {} : { read }),
		...(folderId === undefined ? {} : { folderId }),
		...(payload.action === "inbox" ? { snoozedUntil: null } : {}),
	});
	const values = buildMessageChanges();

	if (payload.action !== "delete" && Object.keys(values).length === 0) {
		return Response.json({ error: "No changes requested" }, { status: 400 });
	}

	const selectedMessages = await db
		.select()
		.from(messages)
		.where(inArray(messages.id, messageIds));
	const allowedMessageIds: string[] = [];

	const permissions = await Promise.all(
		selectedMessages.map((message) =>
			message.mailboxId
				? getMailboxAccessLevel(db, user, message.mailboxId)
				: null
		)
	);
	const collectAccessibleMessages = () => {
		for (const [index, message] of selectedMessages.entries()) {
			if (!message.mailboxId) {
				continue;
			}
			const access = permissions[index];
			const canUpdate =
				payload.action === "read" || payload.action === "unread"
					? access?.canRead
					: access?.canManage;
			if (!canUpdate) {
				continue;
			}
			allowedMessageIds.push(message.id);
		}
	};
	collectAccessibleMessages();

	if (allowedMessageIds.length === 0) {
		return Response.json({ error: "No accessible messages" }, { status: 404 });
	}
	if (payload.action === "delete") {
		// Only mail already in Trash or Spam can be destroyed; anything else is skipped.
		const deletable = selectedMessages.filter(
			(message) =>
				allowedMessageIds.includes(message.id) &&
				isPermanentlyDeletableStatus(message.status)
		);
		const deleted = await permanentlyDeleteMessages(
			env,
			db,
			user.id,
			deletable,
			"bulk"
		);
		return Response.json({
			deleted,
			ok: true,
			skipped: allowedMessageIds.length - deleted,
		});
	}
	if (payload.action === "spam") {
		for (const messageId of allowedMessageIds) {
			await applySpamFeedback(env, user, messageId, "spam");
		}
		return Response.json({ ok: true });
	}
	if (payload.action === "inbox") {
		const spamMessageIds = selectedMessages
			.filter(
				(message) =>
					message.status === "spam" && allowedMessageIds.includes(message.id)
			)
			.map((message) => message.id);
		const normalMessageIds = allowedMessageIds.filter(
			(messageId) => !spamMessageIds.includes(messageId)
		);
		for (const messageId of spamMessageIds) {
			await applySpamFeedback(env, user, messageId, "ham");
		}
		if (normalMessageIds.length) {
			await db
				.update(messages)
				.set(values)
				.where(inArray(messages.id, normalMessageIds));
		}
		return Response.json({ ok: true });
	}

	await db
		.update(messages)
		.set(values)
		.where(inArray(messages.id, allowedMessageIds));
	await Promise.all(
		allowedMessageIds.map((messageId) =>
			createAuditLog(env, {
				action:
					payload.action === "read" || payload.action === "unread"
						? "email.read"
						: "email.delete",
				actorUserId: user.id,
				messageId,
				metadata: { bulkAction: payload.action },
			})
		)
	);

	return Response.json({ ok: true });
}
