import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { driveItems, driveUploadParts } from "@/db/schema";
import { newId } from "@/lib/ids";

import { getDriveItem, getDriveRole, toDriveItemDtos } from "./access";
import { DriveFailure } from "./errors";
import { resolveWritableDriveParent } from "./items";
import { getDriveStorageLimit, getDriveStorageUsed } from "./storage";
import type { DriveItemDto, DriveRow } from "./types";
import {
	canEditDrive,
	DRIVE_MAX_FILE_BYTES,
	DRIVE_MAX_PARTS,
	DRIVE_PART_BYTES,
	DRIVE_UPLOAD_RESUME_MS,
	driveObjectKey,
	normalizeDriveName,
} from "./utils";

export type DriveUploadStart =
	| { complete: true; item: DriveItemDto }
	| {
			complete?: undefined;
			id: string;
			partSize: number;
			parts: number;
			resumed?: true;
			uploaded: number[];
	  };

/** Uploads nobody came back to are discarded so they do not pile up. */
async function discardStaleUploads(env: CloudflareEnv, ownerId: string) {
	const db = getDb(env);
	const stale = await db
		.select()
		.from(driveItems)
		.where(
			and(
				eq(driveItems.ownerId, ownerId),
				isNotNull(driveItems.uploadId),
				lt(driveItems.updatedAt, new Date(Date.now() - DRIVE_UPLOAD_RESUME_MS))
			)
		)
		.limit(20);
	await Promise.all(
		stale.map(async (old) => {
			if (!old.uploadId) {
				return;
			}
			await env.BUCKET.resumeMultipartUpload(
				old.r2Key ?? driveObjectKey(old.ownerId, old.id),
				old.uploadId
			)
				.abort()
				.catch(() => {
					// An expired multipart upload may already have been removed.
				});
			await db
				.delete(driveUploadParts)
				.where(eq(driveUploadParts.itemId, old.id));
			await db.delete(driveItems).where(eq(driveItems.id, old.id));
		})
	);
}

/** An unfinished upload of the same file into the same place, with the parts that already arrived. */
async function resumableUpload(
	db: ReturnType<typeof getDb>,
	file: {
		ownerId: string;
		parentId: string | null;
		name: string;
		size: number;
		fingerprint: string;
	}
): Promise<DriveUploadStart | null> {
	const [pending] = await db
		.select()
		.from(driveItems)
		.where(
			and(
				eq(driveItems.ownerId, file.ownerId),
				file.parentId
					? eq(driveItems.parentId, file.parentId)
					: isNull(driveItems.parentId),
				eq(driveItems.name, file.name),
				eq(driveItems.size, file.size),
				eq(driveItems.uploadFingerprint, file.fingerprint),
				isNotNull(driveItems.uploadId)
			)
		)
		.limit(1);
	if (!pending?.uploadPartSize) {
		return null;
	}
	const done = await db
		.select({ partNumber: driveUploadParts.partNumber })
		.from(driveUploadParts)
		.where(eq(driveUploadParts.itemId, pending.id));
	await db
		.update(driveItems)
		.set({ updatedAt: new Date() })
		.where(eq(driveItems.id, pending.id));
	return {
		id: pending.id,
		partSize: pending.uploadPartSize,
		parts: Math.ceil(file.size / pending.uploadPartSize),
		resumed: true,
		uploaded: done.map((part) => part.partNumber).toSorted((a, b) => a - b),
	};
}

/**
 * Starts an upload. The bytes then go up as raw PUTs of `partSize` (every part but the last is exactly that size) and
 * the upload is completed. Starting again with the same folder, name, size and fingerprint resumes the earlier upload
 * and reports which parts already arrived.
 */
export async function startDriveUpload(
	env: CloudflareEnv,
	userId: string,
	input: {
		name: unknown;
		size: unknown;
		contentType?: unknown;
		parentId?: unknown;
		fingerprint?: unknown;
	}
): Promise<DriveUploadStart> {
	const db = getDb(env);
	const size =
		typeof input.size === "number" &&
		Number.isInteger(input.size) &&
		input.size >= 0
			? input.size
			: null;
	const name = normalizeDriveName(input.name) ?? "Untitled";
	if (size === null) {
		throw new DriveFailure("Invalid file size");
	}
	if (size > DRIVE_MAX_FILE_BYTES) {
		throw new DriveFailure("File is too large", 413);
	}
	const { ownerId, parentId } = await resolveWritableDriveParent(
		db,
		userId,
		typeof input.parentId === "string" ? input.parentId : null
	);
	const fingerprint =
		typeof input.fingerprint === "string"
			? input.fingerprint.slice(0, 100)
			: "";

	await discardStaleUploads(env, ownerId);

	// The same file picked again continues the upload that was interrupted.
	const resumed =
		fingerprint && size > 0
			? await resumableUpload(db, {
					fingerprint,
					name,
					ownerId,
					parentId,
					size,
				})
			: null;
	if (resumed) {
		return resumed;
	}

	const limit = await getDriveStorageLimit(env);
	if (
		limit !== null &&
		(await getDriveStorageUsed(db, ownerId)) + size > limit
	) {
		throw new DriveFailure("Not enough Drive storage left for this file", 413);
	}

	const id = newId("drv");
	const key = driveObjectKey(ownerId, id);
	const contentType =
		typeof input.contentType === "string" && input.contentType
			? input.contentType.slice(0, 255)
			: "application/octet-stream";
	const now = new Date();
	const row: DriveRow = {
		contentType,
		createdAt: now,
		id,
		kind: "file",
		linkToken: null,
		name,
		ownerId,
		parentId,
		r2Key: key,
		size,
		trashedAt: null,
		updatedAt: now,
		uploadFingerprint: null,
		uploadId: null,
		uploadPartSize: null,
	};

	// Multipart uploads need at least one part, so an empty file is simply stored.
	if (size === 0) {
		await env.BUCKET.put(key, new Uint8Array(0), {
			httpMetadata: { contentType },
		});
		try {
			await db.insert(driveItems).values(row);
		} catch (error) {
			await env.BUCKET.delete(key);
			throw error;
		}
		const [item] = await toDriveItemDtos(db, [row], userId, () =>
			ownerId === userId ? "owner" : "edit"
		);
		return { complete: true, item };
	}

	const upload = await env.BUCKET.createMultipartUpload(key, {
		httpMetadata: { contentType },
	});
	row.uploadId = upload.uploadId;
	row.uploadPartSize = DRIVE_PART_BYTES;
	row.uploadFingerprint = fingerprint || null;
	try {
		await db.insert(driveItems).values(row);
	} catch (error) {
		await upload.abort();
		throw error;
	}
	return {
		id,
		partSize: DRIVE_PART_BYTES,
		parts: Math.ceil(size / DRIVE_PART_BYTES),
		uploaded: [],
	};
}

/** An upload still in flight that this user may write to. */
async function loadPendingUpload(
	env: CloudflareEnv,
	userId: string,
	id: string
) {
	const db = getDb(env);
	const item = await getDriveItem(db, id);
	const role = item ? await getDriveRole(db, userId, item) : null;
	if (!item || !item.uploadId || !role || !canEditDrive(role)) {
		throw new DriveFailure("Upload not found", 404);
	}
	const upload = env.BUCKET.resumeMultipartUpload(
		item.r2Key ?? driveObjectKey(item.ownerId, item.id),
		item.uploadId
	);
	return { db, item, role, upload };
}

/** The 1-based part numbers of an upload and the exact byte length each must have. */
export function drivePartSizes(
	item: Pick<DriveRow, "size" | "uploadPartSize">
) {
	const partSize = item.uploadPartSize ?? 0;
	const total = partSize ? Math.ceil(item.size / partSize) : 0;
	return {
		expected: (partNumber: number) =>
			partNumber < total ? partSize : item.size - (total - 1) * partSize,
		total,
	};
}

export async function getPendingDriveUpload(
	env: CloudflareEnv,
	userId: string,
	id: string
) {
	const { db, item } = await loadPendingUpload(env, userId, id);
	const done = await db
		.select({ partNumber: driveUploadParts.partNumber })
		.from(driveUploadParts)
		.where(eq(driveUploadParts.itemId, item.id));
	const uploaded = new Set(done.map((part) => part.partNumber));
	const { total } = drivePartSizes(item);
	return {
		id: item.id,
		missing: Array.from({ length: total }, (_, index) => index + 1).filter(
			(partNumber) => !uploaded.has(partNumber)
		),
		partSize: item.uploadPartSize ?? DRIVE_PART_BYTES,
		parts: total,
		size: item.size,
	};
}

/** Stores one part. R2 needs every part but the last to be the same size, and the declared size must add up. */
export async function uploadDrivePart(
	env: CloudflareEnv,
	userId: string,
	id: string,
	partNumber: number,
	body: ReadableStream | null,
	length: number
) {
	const { db, item, upload } = await loadPendingUpload(env, userId, id);
	const { total, expected } = drivePartSizes(item);
	if (
		!Number.isInteger(partNumber) ||
		partNumber < 1 ||
		partNumber > Math.min(total, DRIVE_MAX_PARTS)
	) {
		throw new DriveFailure("Invalid part number");
	}
	if (!body || length !== expected(partNumber)) {
		throw new DriveFailure(
			`Part ${partNumber} must be exactly ${expected(partNumber)} bytes`
		);
	}
	const part = await upload.uploadPart(partNumber, body);
	await db
		.insert(driveUploadParts)
		.values({ etag: part.etag, itemId: item.id, partNumber })
		.onConflictDoUpdate({
			set: { etag: part.etag },
			target: [driveUploadParts.itemId, driveUploadParts.partNumber],
		});
	await db
		.update(driveItems)
		.set({ updatedAt: new Date() })
		.where(eq(driveItems.id, item.id));
	return { etag: part.etag, partNumber };
}

/** Finishes the upload from the recorded parts and makes the file visible. */
export async function completeDriveUpload(
	env: CloudflareEnv,
	userId: string,
	id: string
) {
	const { db, item, role, upload } = await loadPendingUpload(env, userId, id);
	const parts = await db
		.select({
			etag: driveUploadParts.etag,
			partNumber: driveUploadParts.partNumber,
		})
		.from(driveUploadParts)
		.where(eq(driveUploadParts.itemId, item.id));
	const { total } = drivePartSizes(item);
	if (!total || parts.length !== total) {
		throw new DriveFailure("Some parts are missing", 409);
	}
	let object;
	try {
		object = await upload.complete(
			parts.toSorted((a, b) => a.partNumber - b.partNumber)
		);
	} catch {
		throw new DriveFailure("Could not complete the upload");
	}
	const row: DriveRow = {
		...item,
		size: object.size,
		updatedAt: new Date(),
		uploadFingerprint: null,
		uploadId: null,
		uploadPartSize: null,
	};
	await db
		.update(driveItems)
		.set({
			size: row.size,
			updatedAt: row.updatedAt,
			uploadFingerprint: null,
			uploadId: null,
			uploadPartSize: null,
		})
		.where(eq(driveItems.id, item.id));
	await db.delete(driveUploadParts).where(eq(driveUploadParts.itemId, item.id));
	const [dto] = await toDriveItemDtos(db, [row], userId, () => role);
	return { item: dto };
}

/** Abandons an upload and discards what was sent. */
export async function cancelDriveUpload(
	env: CloudflareEnv,
	userId: string,
	id: string
) {
	const { db, item, upload } = await loadPendingUpload(env, userId, id);
	await upload.abort().catch(() => {
		// Already gone in storage; the row is what matters.
	});
	await db.delete(driveUploadParts).where(eq(driveUploadParts.itemId, item.id));
	await db.delete(driveItems).where(eq(driveItems.id, item.id));
	return { ok: true };
}
