import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";

import { avatarKeyFor } from "@/app/api/profile/avatar/utils";
import { getDb } from "@/db";
import {
	calendarEvents,
	driveItems,
	mailboxes,
	messageAttachments,
	messages,
	sessions,
	users,
} from "@/db/schema";
import { canManageUsers, isPrimaryAdmin } from "@/lib/auth/admin";
import type { SessionUser } from "@/lib/auth/types";
import { deleteDriveItems } from "@/lib/drive/access";
import { driveObjectKey } from "@/lib/drive/utils";
import { newId } from "@/lib/ids";
import { removeMailboxDomainRouting } from "@/lib/mailboxes/domain-addresses";

import type {
	DeleteAccountsInput,
	DeleteAccountsResult,
} from "./deletion-types";
import { getAccountPurgeCutoff } from "./deletion-utils";

const CHUNK = 50;

function chunks<T>(items: T[], size = CHUNK): T[][] {
	const out: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		out.push(items.slice(index, index + size));
	}
	return out;
}

/**
 * Moves Drive files (documents included) and calendar events from one account to another. Drive items that sat at
 * the top level go into a folder on the receiving account so they do not mix with its own files.
 */
export async function transferAccountData(
	env: CloudflareEnv,
	fromId: string,
	fromName: string,
	toId: string
): Promise<void> {
	const db = getDb(env);
	const items = await db
		.select()
		.from(driveItems)
		.where(eq(driveItems.ownerId, fromId));
	if (items.length) {
		// Stored objects are keyed by owner unless the row records its key, so pin the key before the owner changes.
		for (const row of items) {
			if (row.kind === "file" && !row.r2Key) {
				await db
					.update(driveItems)
					.set({ r2Key: driveObjectKey(fromId, row.id) })
					.where(eq(driveItems.id, row.id));
			}
		}
		const folderId = newId();
		await db.insert(driveItems).values({
			id: folderId,
			kind: "folder",
			name: `Files from ${fromName}`.slice(0, 255),
			ownerId: toId,
			parentId: null,
		});
		const rootIds = items.filter((row) => !row.parentId).map((row) => row.id);
		for (const ids of chunks(rootIds)) {
			await db
				.update(driveItems)
				.set({ parentId: folderId })
				.where(inArray(driveItems.id, ids));
		}
		await db
			.update(driveItems)
			.set({ ownerId: toId })
			.where(and(eq(driveItems.ownerId, fromId), isNull(driveItems.uploadId)));
	}
	await db
		.update(calendarEvents)
		.set({ userId: toId })
		.where(eq(calendarEvents.userId, fromId));
}

/**
 * Soft-deletes accounts: they are disabled, signed out and stamped with `deletedAt`. They can be restored until the
 * scheduled purge removes them after the retention window. Optionally hands their Drive and calendar data to another account.
 */
export async function deleteAccounts(
	env: CloudflareEnv,
	actor: SessionUser,
	input: DeleteAccountsInput
): Promise<DeleteAccountsResult> {
	if (!canManageUsers(actor)) {
		return {
			error: "You do not have permission to manage users",
			ok: false,
			status: 403,
		};
	}
	const ids = [...new Set(input.ids)];
	if (!ids.length) {
		return { error: "Select at least one account", ok: false, status: 400 };
	}
	const db = getDb(env);
	const targets: (typeof users.$inferSelect)[] = [];
	for (const group of chunks(ids)) {
		targets.push(
			...(await db.select().from(users).where(inArray(users.id, group)))
		);
	}
	if (targets.length !== ids.length) {
		return { error: "Account not found", ok: false, status: 404 };
	}
	for (const target of targets) {
		if (target.id === actor.id) {
			return {
				error: "You cannot delete your own account",
				ok: false,
				status: 400,
			};
		}
		if (target.isPrimaryAdmin) {
			return {
				error: "The primary admin cannot be deleted",
				ok: false,
				status: 403,
			};
		}
		if (!isPrimaryAdmin(actor) && target.role === "admin") {
			return {
				error: "Only the primary admin can manage admin accounts",
				ok: false,
				status: 403,
			};
		}
		if (target.deletedAt) {
			return {
				error: `${target.email} is already deleted`,
				ok: false,
				status: 409,
			};
		}
	}
	const transferAndDisableAccounts =
		async (): Promise<DeleteAccountsResult> => {
			const transferToId = input.transferToId || null;
			if (transferToId) {
				const [recipient] = await db
					.select()
					.from(users)
					.where(eq(users.id, transferToId))
					.limit(1);
				if (
					!recipient ||
					recipient.disabled ||
					recipient.deletedAt ||
					ids.includes(recipient.id)
				) {
					return {
						error: "Choose an active account to transfer data to",
						ok: false,
						status: 400,
					};
				}
				if (
					!isPrimaryAdmin(actor) &&
					recipient.role === "admin" &&
					recipient.id !== actor.id
				) {
					return {
						error:
							"Only the primary admin can transfer data to an admin account",
						ok: false,
						status: 403,
					};
				}
				for (const target of targets) {
					await transferAccountData(
						env,
						target.id,
						target.name || target.email,
						recipient.id
					);
				}
			}
			const now = new Date();
			for (const group of chunks(ids)) {
				await db
					.update(users)
					.set({ deletedAt: now, disabled: true })
					.where(inArray(users.id, group));
				await db.delete(sessions).where(inArray(sessions.userId, group));
			}
			return { deleted: ids.length, ok: true };
		};
	return await transferAndDisableAccounts();
}

export async function restoreAccount(
	env: CloudflareEnv,
	actor: SessionUser,
	id: string
): Promise<DeleteAccountsResult> {
	if (!canManageUsers(actor)) {
		return {
			error: "You do not have permission to manage users",
			ok: false,
			status: 403,
		};
	}
	const db = getDb(env);
	const [target] = await db
		.select()
		.from(users)
		.where(eq(users.id, id))
		.limit(1);
	if (!target) {
		return { error: "Account not found", ok: false, status: 404 };
	}
	if (!target.deletedAt) {
		return { error: "Account is not deleted", ok: false, status: 409 };
	}
	if (!isPrimaryAdmin(actor) && target.role === "admin") {
		return {
			error: "Only the primary admin can manage admin accounts",
			ok: false,
			status: 403,
		};
	}
	await db
		.update(users)
		.set({ deletedAt: null, disabled: false })
		.where(eq(users.id, id));
	return { deleted: 0, ok: true };
}

async function purgeAccount(
	env: CloudflareEnv,
	account: typeof users.$inferSelect
): Promise<void> {
	const db = getDb(env);
	const owned = await db
		.select()
		.from(mailboxes)
		.where(eq(mailboxes.userId, account.id));
	for (const mailbox of owned) {
		try {
			await removeMailboxDomainRouting(env, db, mailbox);
		} catch (error) {
			console.error("Account purge: could not remove routing", {
				error,
				mailboxId: mailbox.id,
			});
		}
	}
	const rootItems = await db
		.select()
		.from(driveItems)
		.where(
			and(eq(driveItems.ownerId, account.id), isNull(driveItems.parentId))
		);
	if (rootItems.length) {
		await deleteDriveItems(env, rootItems);
	}
	for (const mailbox of owned) {
		const raw = await db
			.select({ key: messages.rawR2Key })
			.from(messages)
			.where(
				and(eq(messages.mailboxId, mailbox.id), isNotNull(messages.rawR2Key))
			);
		const attachments = await db
			.select({ key: messageAttachments.r2Key })
			.from(messageAttachments)
			.innerJoin(messages, eq(messages.id, messageAttachments.messageId))
			.where(eq(messages.mailboxId, mailbox.id));
		const keys = [
			...raw.map((row) => row.key),
			...attachments.map((row) => row.key),
		].filter((key): key is string => !!key);
		for (const group of chunks(keys, 500)) {
			await env.BUCKET.delete(group);
		}
	}
	await env.BUCKET.delete(account.avatarKey ?? avatarKeyFor(account.id));
	await db.delete(users).where(eq(users.id, account.id));
}

/** Removes accounts whose restore window has ended, with their data. Runs from the daily scheduled handler. */
export async function runAccountRetention(
	env: CloudflareEnv,
	now = new Date()
): Promise<number> {
	const db = getDb(env);
	const expired = await db
		.select()
		.from(users)
		.where(
			and(
				isNotNull(users.deletedAt),
				lte(users.deletedAt, getAccountPurgeCutoff(now))
			)
		)
		.limit(20);
	let removed = 0;
	for (const account of expired) {
		try {
			await purgeAccount(env, account);
			removed += 1;
		} catch (error) {
			console.error("Account purge failed", { error, userId: account.id });
		}
	}
	return removed;
}
