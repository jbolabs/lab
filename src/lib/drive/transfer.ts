import { and, eq, gt, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { driveTransferTokens, users } from "@/db/schema";
import { hash, secret } from "@/lib/oauth/config";

export type DriveTransferAction = "upload" | "download";

/** A signed part URL must outlive one 64 MiB part on a slow link; calling the tool again issues fresh ones. */
const TRANSFER_MS: Record<DriveTransferAction, number> = {
	download: 15 * 60 * 1000,
	upload: 60 * 60 * 1000,
};

/**
 * Issues a capability for one item and one action, carried in a URL as `?token=`. It acts as the user who asked
 * for it, and every request still re-checks that user's access to the item.
 */
export async function createDriveTransferToken(
	env: CloudflareEnv,
	userId: string,
	itemId: string,
	action: DriveTransferAction
) {
	const db = getDb(env);
	const now = new Date();
	await db
		.delete(driveTransferTokens)
		.where(lt(driveTransferTokens.expiresAt, now));
	const token = secret();
	const expiresAt = new Date(now.getTime() + TRANSFER_MS[action]);
	await db.insert(driveTransferTokens).values({
		action,
		expiresAt,
		itemId,
		tokenHash: await hash(token),
		userId,
	});
	return { expiresAt: expiresAt.toISOString(), token };
}

export async function redeemDriveTransferToken(
	env: CloudflareEnv,
	token: string,
	itemId: string,
	action: DriveTransferAction
) {
	if (!token || token.length > 128) {
		return null;
	}
	const [row] = await getDb(env)
		.select({ user: users })
		.from(driveTransferTokens)
		.innerJoin(users, eq(driveTransferTokens.userId, users.id))
		.where(
			and(
				eq(driveTransferTokens.tokenHash, await hash(token)),
				eq(driveTransferTokens.itemId, itemId),
				eq(driveTransferTokens.action, action),
				gt(driveTransferTokens.expiresAt, new Date())
			)
		)
		.limit(1);
	return row && !row.user.disabled ? row.user : null;
}

export function driveUploadPartUrl(
	baseUrl: string,
	itemId: string,
	partNumber: number,
	token: string
) {
	const url = new URL(
		`/api/drive/upload/${encodeURIComponent(itemId)}`,
		baseUrl
	);
	url.searchParams.set("part", String(partNumber));
	url.searchParams.set("token", token);
	return url.toString();
}

export function driveDownloadUrl(
	baseUrl: string,
	itemId: string,
	token: string
) {
	const url = new URL(
		`/api/drive/items/${encodeURIComponent(itemId)}/content`,
		baseUrl
	);
	url.searchParams.set("download", "1");
	url.searchParams.set("token", token);
	return url.toString();
}
