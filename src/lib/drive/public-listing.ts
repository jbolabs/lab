import { and, eq, isNull } from "drizzle-orm";

import type { getDb } from "@/db";
import { driveItems } from "@/db/schema";

import { getDriveChain, getPublicDriveItem } from "./access";
import type { DriveRow } from "./types";

type Db = ReturnType<typeof getDb>;

const publicItem = (row: DriveRow) => ({
	contentType: row.contentType,
	id: row.id,
	kind: row.kind,
	name: row.name,
	size: row.size,
	updatedAt: row.updatedAt.toISOString(),
});

export type PublicDriveItem = ReturnType<typeof publicItem>;

export interface PublicDriveListing {
	item: PublicDriveItem;
	items: PublicDriveItem[];
	path: { id: string; name: string }[];
}

export function listDriveChildren(db: Db, parentId: string) {
	return db
		.select()
		.from(driveItems)
		.where(
			and(
				eq(driveItems.parentId, parentId),
				isNull(driveItems.trashedAt),
				isNull(driveItems.uploadId)
			)
		);
}

/** What anyone holding a share link sees: the item, a folder's children, and the path from the shared root. */
export async function loadPublicDriveListing(
	db: Db,
	token: string,
	itemId?: string | null
): Promise<PublicDriveListing | null> {
	const resolved = await getPublicDriveItem(db, token, itemId);
	if (!resolved) {
		return null;
	}
	const { root, item } = resolved;
	const children =
		item.kind === "folder" ? await listDriveChildren(db, item.id) : [];
	const chain = await getDriveChain(db, item);
	return {
		item: publicItem(item),
		items: children.map(publicItem),
		path: chain
			.slice(chain.findIndex((entry) => entry.id === root.id))
			.map((entry) => ({ id: entry.id, name: entry.name })),
	};
}
