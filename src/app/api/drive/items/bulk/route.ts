import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { chunks } from "@/app/api/drive/bulk-utils";
import { driveItems } from "@/db/schema";
import {
	deleteDriveItems,
	getDriveChain,
	getDriveItem,
	getDriveRole,
} from "@/lib/drive/access";
import { authorizeDrive } from "@/lib/drive/auth";
import type { DriveRow } from "@/lib/drive/types";
import { canEditDrive } from "@/lib/drive/utils";

const MAX_BULK_ITEMS = 200;

/**
 * Applies one action to several items: trash, restore, move or delete (forever, trashed items only). Anyone who can edit
 * an item may move it to the trash; restoring, moving and deleting forever are for the owner. Moving a trashed item
 * also takes it out of the trash, so it can be dragged from Trash straight into a folder.
 */
export async function POST(request: Request) {
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	const { env, db, user } = auth;
	const body = (await request.json().catch(() => ({}))) as {
		action?: unknown;
		ids?: unknown;
		parentId?: unknown;
	};
	const ids = Array.isArray(body.ids)
		? [
				...new Set(
					body.ids.filter((id): id is string => typeof id === "string")
				),
			]
		: [];
	if (!ids.length || ids.length > MAX_BULK_ITEMS) {
		return NextResponse.json(
			{ error: "Select between 1 and 200 items" },
			{ status: 400 }
		);
	}

	const groups = await Promise.all(
		chunks(ids).map((slice) =>
			db.select().from(driveItems).where(inArray(driveItems.id, slice))
		)
	);
	const owned: DriveRow[] = groups.flat();
	if (owned.length !== ids.length) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	const permissions = await Promise.all(
		owned.map(
			async (row) =>
				row.ownerId === user.id ||
				(body.action === "trash" &&
					canEditDrive(await getDriveRole(db, user.id, row)))
		)
	);
	if (permissions.some((allowed) => !allowed)) {
		return NextResponse.json(
			{ error: "Only the owner can change these items" },
			{ status: 403 }
		);
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
		return targets.length;
	};

	if (body.action === "trash") {
		return NextResponse.json({
			count: await update(
				owned.filter((row) => !row.trashedAt),
				{ trashedAt: new Date() }
			),
		});
	}
	if (body.action === "restore") {
		return NextResponse.json({
			count: await update(
				owned.filter((row) => row.trashedAt),
				{ trashedAt: null }
			),
		});
	}
	if (body.action === "delete") {
		const trashed = owned.filter((row) => row.trashedAt);
		if (trashed.length) {
			await deleteDriveItems(env, trashed);
		}
		return NextResponse.json({ count: trashed.length });
	}
	if (body.action === "move") {
		let parentId: string | null = null;
		if (typeof body.parentId === "string" && body.parentId) {
			const destination = await getDriveItem(db, body.parentId);
			if (
				!destination ||
				destination.ownerId !== user.id ||
				destination.kind !== "folder" ||
				destination.trashedAt ||
				destination.uploadId
			) {
				return NextResponse.json(
					{ error: "Folder not found" },
					{ status: 404 }
				);
			}
			// A folder cannot move into itself or anything beneath it.
			const ancestors = await getDriveChain(db, destination);
			const chain = new Set(ancestors.map((row) => row.id));
			if (owned.some((row) => chain.has(row.id))) {
				return NextResponse.json(
					{ error: "Cannot move a folder into itself" },
					{ status: 400 }
				);
			}
			parentId = destination.id;
		}
		return NextResponse.json({
			count: await update(
				owned.filter((row) => row.parentId !== parentId || row.trashedAt),
				{ parentId, trashedAt: null }
			),
		});
	}
	return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
