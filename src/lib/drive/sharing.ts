import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { driveItems, driveShares, users } from "@/db/schema";
import { newId } from "@/lib/ids";

import { getDriveItem } from "./access";
import { DriveFailure } from "./errors";
import type { DriveShareDto } from "./types";

type Db = ReturnType<typeof getDb>;

/** Only the owner manages who can open an item, and not while it is in the trash. */
async function ownedItem(db: Db, userId: string, id: string) {
	const item = await getDriveItem(db, id);
	if (!item || item.ownerId !== userId || item.trashedAt || item.uploadId) {
		throw new DriveFailure("Not found", 404);
	}
	return item;
}

function listShares(db: Db, itemId: string): Promise<DriveShareDto[]> {
	return db
		.select({
			email: users.email,
			id: driveShares.id,
			name: users.name,
			role: driveShares.role,
			userId: driveShares.userId,
		})
		.from(driveShares)
		.innerJoin(users, eq(driveShares.userId, users.id))
		.where(eq(driveShares.itemId, itemId))
		.orderBy(driveShares.createdAt);
}

export async function getDriveSharing(
	env: CloudflareEnv,
	userId: string,
	id: string
) {
	const db = getDb(env);
	const item = await ownedItem(db, userId, id);
	return { linkToken: item.linkToken, shares: await listShares(db, item.id) };
}

/** Shares with another account by email, or changes the role of an existing share. */
export async function shareDriveItem(
	env: CloudflareEnv,
	userId: string,
	id: string,
	input: { email?: unknown; role?: unknown }
) {
	const db = getDb(env);
	const item = await ownedItem(db, userId, id);
	const email =
		typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
	const role = input.role === "edit" ? "edit" : "view";
	if (!email) {
		throw new DriveFailure("Enter an email address");
	}
	const [target] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (!target) {
		throw new DriveFailure("No account uses that email address", 404);
	}
	if (target.id === userId) {
		throw new DriveFailure("You already own this item");
	}
	await db
		.insert(driveShares)
		.values({ id: newId("dshr"), itemId: item.id, role, userId: target.id })
		.onConflictDoUpdate({
			set: { role },
			target: [driveShares.itemId, driveShares.userId],
		});
	return { shares: await listShares(db, item.id) };
}

/** Stops sharing, by share id or by the other account's email. */
export async function unshareDriveItem(
	env: CloudflareEnv,
	userId: string,
	id: string,
	input: { shareId?: unknown; email?: unknown }
) {
	const db = getDb(env);
	const item = await ownedItem(db, userId, id);
	const shares = await listShares(db, item.id);
	const email =
		typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
	const share = shares.find((entry) =>
		typeof input.shareId === "string" && input.shareId
			? entry.id === input.shareId
			: !!email && entry.email.toLowerCase() === email
	);
	if (!share) {
		// Removing a share id that is already gone is a no-op; an unknown email is a mistake worth reporting.
		if (email && !input.shareId) {
			throw new DriveFailure("Not shared with that email address", 404);
		}
		return { shares };
	}
	await db
		.delete(driveShares)
		.where(and(eq(driveShares.id, share.id), eq(driveShares.itemId, item.id)));
	return { shares: shares.filter((entry) => entry.id !== share.id) };
}

/** Turns the "anyone with the link can view" URL on or off. Turning it off invalidates the old token. */
export async function setDriveLink(
	env: CloudflareEnv,
	userId: string,
	id: string,
	enabled: boolean
) {
	const db = getDb(env);
	const item = await ownedItem(db, userId, id);
	const linkToken = enabled
		? (item.linkToken ??
			`${newId()}${newId()}`.replaceAll(/[^A-Za-z0-9]/gu, "").slice(0, 32))
		: null;
	await db.update(driveItems).set({ linkToken }).where(eq(driveItems.id, id));
	return { linkToken };
}

/** The public page for a link token. */
export function drivePublicUrl(baseUrl: string, linkToken: string) {
	return new URL(`/d/${encodeURIComponent(linkToken)}`, baseUrl).toString();
}
