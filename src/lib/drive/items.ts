import {
	and,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	or,
	sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import { driveItems, driveShares } from "@/db/schema";
import type { users } from "@/db/schema";
import { newId } from "@/lib/ids";

import {
	deleteDriveItems,
	getDriveChain,
	getDriveItem,
	getDriveRole,
	toDriveItemDtos,
	withoutTrashedAncestors,
} from "./access";
import { listDriveAttachments } from "./attachments";
import { driveTypesCondition } from "./categories";
import type { DriveCategory } from "./category-names";
import { DriveFailure } from "./errors";
import { getDriveStorageLimit, getDriveStorageUsed } from "./storage";
import type { DriveItemDto, DriveRole, DriveRow } from "./types";
import {
	canEditDrive,
	chunks,
	normalizeDriveName,
	toDriveCrumbs,
} from "./utils";

type Db = ReturnType<typeof getDb>;
type User = typeof users.$inferSelect;

export type DriveView = "my" | "shared" | "trash" | "attachments";

export const DRIVE_BULK_ACTIONS = [
	"trash",
	"restore",
	"move",
	"delete",
] as const;
export type DriveBulkAction = (typeof DRIVE_BULK_ACTIONS)[number];
const MAX_BULK_ITEMS = 200;

export async function getDriveUsage(env: CloudflareEnv, userId: string) {
	return {
		storageLimit: await getDriveStorageLimit(env),
		storageUsed: await getDriveStorageUsed(getDb(env), userId),
	};
}

async function trimToSharedRoot(
	db: Db,
	userId: string,
	chain: DriveRow[]
): Promise<DriveRow[]> {
	const shares = await Promise.all(
		chain.map((item) =>
			db
				.select({ id: driveShares.id })
				.from(driveShares)
				.where(
					and(eq(driveShares.itemId, item.id), eq(driveShares.userId, userId))
				)
				.limit(1)
		)
	);
	const index = shares.findIndex((rows) => rows.length > 0);
	return index === -1 ? chain : chain.slice(index);
}

/** The path a user sees for an item: from their root, or from the folder that was shared with them. */
async function visiblePath(db: Db, userId: string, item: DriveRow) {
	const chain = await getDriveChain(db, item);
	return toDriveCrumbs(
		item.ownerId === userId ? chain : await trimToSharedRoot(db, userId, chain)
	);
}

/**
 * One Drive listing: a folder (`parentId`), My Drive (optionally searched by name with `query`), shared with me,
 * trash, or email attachments. Email attachments, alone or in trash, appear only when `attachments` is allowed.
 */
export async function listDriveView(
	env: CloudflareEnv,
	user: User,
	input: {
		view?: DriveView;
		parentId?: string | null;
		query?: string | null;
		types?: DriveCategory[];
		attachments?: boolean;
	}
) {
	const db = getDb(env);
	const types = input.types ?? [];
	const query = input.query?.trim();
	// With a type filter, files must match but folders stay listed so you can still browse into them.
	const typeFilter = types.length
		? or(eq(driveItems.kind, "folder"), driveTypesCondition(types))
		: undefined;
	const meta = await getDriveUsage(env, user.id);
	const respond = (
		items: DriveItemDto[],
		role: DriveRole,
		path: ReturnType<typeof toDriveCrumbs> = []
	) => ({ items, path, role, ...meta });

	if (input.parentId) {
		const folder = await getDriveItem(db, input.parentId);
		const role =
			folder?.kind === "folder"
				? await getDriveRole(db, user.id, folder)
				: null;
		if (!folder || !role) {
			throw new DriveFailure("Folder not found", 404);
		}
		const rows = await db
			.select()
			.from(driveItems)
			.where(
				and(
					eq(driveItems.parentId, folder.id),
					isNull(driveItems.trashedAt),
					isNull(driveItems.uploadId),
					typeFilter
				)
			);
		return respond(
			await toDriveItemDtos(db, rows, user.id, () => role),
			role,
			await visiblePath(db, user.id, folder)
		);
	}

	if (input.view === "attachments") {
		if (!input.attachments) {
			throw new DriveFailure(
				"Email attachments are only available in the app",
				403
			);
		}
		return respond(await listDriveAttachments(db, user, types), "view");
	}

	if (input.view === "shared") {
		const rows = await db
			.select({ item: driveItems, role: driveShares.role })
			.from(driveShares)
			.innerJoin(driveItems, eq(driveShares.itemId, driveItems.id))
			.where(
				and(
					eq(driveShares.userId, user.id),
					isNull(driveItems.trashedAt),
					isNull(driveItems.uploadId),
					typeFilter
				)
			)
			.orderBy(desc(driveShares.createdAt));
		const roles = new Map(
			rows.map((row) => [row.item.id, row.role as DriveRole])
		);
		return respond(
			await toDriveItemDtos(
				db,
				rows.map((row) => row.item),
				user.id,
				(row) => roles.get(row.id) ?? "view"
			),
			"view"
		);
	}

	if (input.view === "trash") {
		const rows = await db
			.select()
			.from(driveItems)
			.where(
				and(
					eq(driveItems.ownerId, user.id),
					isNotNull(driveItems.trashedAt),
					typeFilter
				)
			)
			.orderBy(desc(driveItems.trashedAt));
		const trashedAttachments = input.attachments
			? await listDriveAttachments(db, user, types, true)
			: [];
		const merged = [
			...(await toDriveItemDtos(db, rows, user.id)),
			...trashedAttachments,
		].toSorted((a, b) => (b.trashedAt ?? "").localeCompare(a.trashedAt ?? ""));
		return respond(merged, "owner");
	}

	// My Drive. A type filter, like a search, looks through every folder instead of only the top level.
	if (types.length && !query) {
		const rows = await db
			.select()
			.from(driveItems)
			.where(
				and(
					eq(driveItems.ownerId, user.id),
					eq(driveItems.kind, "file"),
					isNull(driveItems.trashedAt),
					isNull(driveItems.uploadId),
					driveTypesCondition(types)
				)
			)
			.orderBy(desc(driveItems.updatedAt))
			.limit(1000);
		return respond(
			await toDriveItemDtos(
				db,
				await withoutTrashedAncestors(db, rows),
				user.id
			),
			"owner"
		);
	}
	const conditions = [
		eq(driveItems.ownerId, user.id),
		isNull(driveItems.trashedAt),
		isNull(driveItems.uploadId),
	];
	if (query) {
		conditions.push(
			sql`${driveItems.name} like ${`%${query.replaceAll(/[\\%_]/gu, "\\$&")}%`} escape '\\'`
		);
	} else {
		conditions.push(isNull(driveItems.parentId));
	}
	if (typeFilter) {
		conditions.push(typeFilter);
	}
	const rows = await db
		.select()
		.from(driveItems)
		.where(and(...conditions))
		.orderBy(desc(driveItems.updatedAt))
		.limit(query ? 200 : 1000);
	return respond(
		await toDriveItemDtos(
			db,
			query ? await withoutTrashedAncestors(db, rows) : rows,
			user.id
		),
		"owner"
	);
}

/** An item's metadata and path. The owner also sees items in the trash. */
export async function getDriveItemDetails(
	env: CloudflareEnv,
	userId: string,
	id: string
) {
	const db = getDb(env);
	const item = await getDriveItem(db, id);
	const role =
		item && !item.uploadId
			? await getDriveRole(db, userId, item, item.ownerId === userId)
			: null;
	if (!item || !role) {
		throw new DriveFailure("Not found", 404);
	}
	const [dto] = await toDriveItemDtos(db, [item], userId, () => role);
	return { item: dto, path: await visiblePath(db, userId, item) };
}

/** Resolves a folder the user may add to; the new item belongs to that folder's owner. */
async function writableParent(
	db: Db,
	userId: string,
	parentId: string | null | undefined
) {
	if (!parentId) {
		return { ownerId: userId, parentId: null };
	}
	const parent = await getDriveItem(db, parentId);
	const role =
		parent?.kind === "folder" && !parent.uploadId
			? await getDriveRole(db, userId, parent)
			: null;
	if (!parent || !canEditDrive(role)) {
		throw new DriveFailure("Folder not found", 404);
	}
	return { ownerId: parent.ownerId, parentId: parent.id };
}

export { writableParent as resolveWritableDriveParent };

export async function createDriveFolder(
	env: CloudflareEnv,
	userId: string,
	input: { name: unknown; parentId?: string | null }
) {
	const db = getDb(env);
	const name = normalizeDriveName(input.name);
	if (!name) {
		throw new DriveFailure("Enter a folder name");
	}
	const { ownerId, parentId } = await writableParent(
		db,
		userId,
		input.parentId
	);
	const now = new Date();
	const row: DriveRow = {
		contentType: "application/x-directory",
		createdAt: now,
		id: newId("drv"),
		kind: "folder",
		linkToken: null,
		name,
		ownerId,
		parentId,
		r2Key: null,
		size: 0,
		trashedAt: null,
		updatedAt: now,
		uploadFingerprint: null,
		uploadId: null,
		uploadPartSize: null,
	};
	await db.insert(driveItems).values(row);
	const [item] = await toDriveItemDtos(db, [row], userId, () =>
		ownerId === userId ? "owner" : "edit"
	);
	return { item };
}

/** Rename, move to trash or restore. Editors may trash; only the owner can restore. */
export async function updateDriveItem(
	env: CloudflareEnv,
	userId: string,
	id: string,
	input: { name?: unknown; trashed?: unknown }
) {
	const db = getDb(env);
	const item = await getDriveItem(db, id);
	if (!item) {
		throw new DriveFailure("Not found", 404);
	}
	const restoring = input.trashed === false && !!item.trashedAt;
	const role = await getDriveRole(db, userId, item, restoring);
	if (!role || !canEditDrive(role)) {
		throw new DriveFailure("Not found", 404);
	}
	if (input.trashed === false && role !== "owner") {
		throw new DriveFailure("Only the owner can do that", 403);
	}
	const patch: Partial<typeof driveItems.$inferInsert> = {
		updatedAt: new Date(),
	};
	if (input.name !== undefined) {
		const name = normalizeDriveName(input.name);
		if (!name) {
			throw new DriveFailure("Enter a name");
		}
		patch.name = name;
	}
	if (typeof input.trashed === "boolean") {
		patch.trashedAt = input.trashed ? new Date() : null;
	}
	await db.update(driveItems).set(patch).where(eq(driveItems.id, id));
	const [updated] = await toDriveItemDtos(
		db,
		[{ ...item, ...patch } as DriveRow],
		userId,
		() => role
	);
	return { item: updated };
}

/** Permanently deletes an item the owner has already moved to the trash. */
export async function deleteDriveItemForever(
	env: CloudflareEnv,
	userId: string,
	id: string
) {
	const item = await getDriveItem(getDb(env), id);
	if (!item || item.ownerId !== userId) {
		throw new DriveFailure("Not found", 404);
	}
	if (!item.trashedAt) {
		throw new DriveFailure("Move the item to trash first", 409);
	}
	await deleteDriveItems(env, [item]);
	return { ok: true };
}

/**
 * Applies one action to several items: trash, restore, move or delete (forever, trashed items only). Anyone who can edit
 * an item may move it to the trash; restoring, moving and deleting forever are for the owner. Moving a trashed item
 * also takes it out of the trash, so it can be dragged from Trash straight into a folder.
 */
export async function applyDriveBulkAction(
	env: CloudflareEnv,
	userId: string,
	input: { action: unknown; ids: unknown; parentId?: unknown }
) {
	const db = getDb(env);
	const ids = Array.isArray(input.ids)
		? [
				...new Set(
					input.ids.filter((id): id is string => typeof id === "string")
				),
			]
		: [];
	if (!ids.length || ids.length > MAX_BULK_ITEMS) {
		throw new DriveFailure("Select between 1 and 200 items");
	}
	if (!DRIVE_BULK_ACTIONS.includes(input.action as DriveBulkAction)) {
		throw new DriveFailure("Unknown action");
	}
	const groups = await Promise.all(
		chunks(ids).map((slice) =>
			db.select().from(driveItems).where(inArray(driveItems.id, slice))
		)
	);
	const owned: DriveRow[] = groups.flat();
	if (owned.length !== ids.length) {
		throw new DriveFailure("Not found", 404);
	}
	const permissions = await Promise.all(
		owned.map(
			async (row) =>
				row.ownerId === userId ||
				(input.action === "trash" &&
					canEditDrive(await getDriveRole(db, userId, row)))
		)
	);
	if (permissions.some((allowed) => !allowed)) {
		throw new DriveFailure("Only the owner can change these items", 403);
	}
	const update = async (
		rows: DriveRow[],
		set: Partial<typeof driveItems.$inferInsert>
	) => {
		const targets = rows.map((row) => row.id);
		await Promise.all(
			chunks(targets).map((slice) =>
				db
					.update(driveItems)
					.set({ ...set, updatedAt: new Date() })
					.where(inArray(driveItems.id, slice))
			)
		);
		return { count: targets.length };
	};

	if (input.action === "trash") {
		return update(
			owned.filter((row) => !row.trashedAt),
			{ trashedAt: new Date() }
		);
	}
	if (input.action === "restore") {
		return update(
			owned.filter((row) => row.trashedAt),
			{ trashedAt: null }
		);
	}
	if (input.action === "delete") {
		const trashed = owned.filter((row) => row.trashedAt);
		if (trashed.length) {
			await deleteDriveItems(env, trashed);
		}
		return { count: trashed.length };
	}
	let parentId: string | null = null;
	if (typeof input.parentId === "string" && input.parentId) {
		const destination = await getDriveItem(db, input.parentId);
		if (
			!destination ||
			destination.ownerId !== userId ||
			destination.kind !== "folder" ||
			destination.trashedAt ||
			destination.uploadId
		) {
			throw new DriveFailure("Folder not found", 404);
		}
		// A folder cannot move into itself or anything beneath it.
		const ancestors = await getDriveChain(db, destination);
		const chain = new Set(ancestors.map((row) => row.id));
		if (owned.some((row) => chain.has(row.id))) {
			throw new DriveFailure("Cannot move a folder into itself");
		}
		parentId = destination.id;
	}
	return update(
		owned.filter((row) => row.parentId !== parentId || row.trashedAt),
		{ parentId, trashedAt: null }
	);
}
