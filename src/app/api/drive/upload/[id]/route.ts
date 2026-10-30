import { eq } from "drizzle-orm";

import { driveItems, driveUploadParts } from "@/db/schema";
import {
	getDriveItem,
	getDriveRole,
	toDriveItemDtos,
} from "@/lib/drive/access";
import { authorizeDrive } from "@/lib/drive/auth";
import {
	canEditDrive,
	DRIVE_MAX_PARTS,
	driveObjectKey,
} from "@/lib/drive/utils";

import type { DriveItemParams } from "../../items/[id]/types";

async function loadPending(
	request: Request,
	params: DriveItemParams["params"]
) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return { error: auth.error } as const;
	}
	const item = await getDriveItem(auth.db, id);
	const role = item ? await getDriveRole(auth.db, auth.user.id, item) : null;
	if (!item || !item.uploadId || !role || !canEditDrive(role)) {
		return {
			error: Response.json({ error: "Upload not found" }, { status: 404 }),
		} as const;
	}
	const upload = auth.env.BUCKET.resumeMultipartUpload(
		item.r2Key ?? driveObjectKey(item.ownerId, item.id),
		item.uploadId
	);
	return { ...auth, item, role, upload } as const;
}

/** Uploads one part. The body is the raw bytes of the part. */
export async function PUT(request: Request, { params }: DriveItemParams) {
	const ctx = await loadPending(request, params);
	if (ctx.error) {
		return ctx.error;
	}
	const partNumber = Number(new URL(request.url).searchParams.get("part"));
	const length = Number(request.headers.get("content-length"));
	const partSize = ctx.item.uploadPartSize ?? 0;
	const total = partSize ? Math.ceil(ctx.item.size / partSize) : 0;
	if (
		!Number.isInteger(partNumber) ||
		partNumber < 1 ||
		partNumber > Math.min(total, DRIVE_MAX_PARTS)
	) {
		return Response.json({ error: "Invalid part number" }, { status: 400 });
	}
	// R2 needs every part but the last to be the same size, and the size the client declared must add up.
	const expected =
		partNumber < total ? partSize : ctx.item.size - (total - 1) * partSize;
	if (!request.body || length !== expected) {
		return Response.json({ error: "Invalid part size" }, { status: 400 });
	}
	const part = await ctx.upload.uploadPart(partNumber, request.body);
	await ctx.db
		.insert(driveUploadParts)
		.values({ etag: part.etag, itemId: ctx.item.id, partNumber })
		.onConflictDoUpdate({
			set: { etag: part.etag },
			target: [driveUploadParts.itemId, driveUploadParts.partNumber],
		});
	await ctx.db
		.update(driveItems)
		.set({ updatedAt: new Date() })
		.where(eq(driveItems.id, ctx.item.id));
	return Response.json({ etag: part.etag, partNumber });
}

/** Finishes the upload from the recorded parts and makes the file visible. */
export async function POST(request: Request, { params }: DriveItemParams) {
	const ctx = await loadPending(request, params);
	if (ctx.error) {
		return ctx.error;
	}
	const parts = await ctx.db
		.select({
			etag: driveUploadParts.etag,
			partNumber: driveUploadParts.partNumber,
		})
		.from(driveUploadParts)
		.where(eq(driveUploadParts.itemId, ctx.item.id));
	const total = ctx.item.uploadPartSize
		? Math.ceil(ctx.item.size / ctx.item.uploadPartSize)
		: 0;
	if (!total || parts.length !== total) {
		return Response.json({ error: "Some parts are missing" }, { status: 409 });
	}
	let object;
	try {
		object = await ctx.upload.complete(parts);
	} catch {
		return Response.json(
			{ error: "Could not complete the upload" },
			{ status: 400 }
		);
	}
	const row = {
		...ctx.item,
		size: object.size,
		updatedAt: new Date(),
		uploadFingerprint: null,
		uploadId: null,
		uploadPartSize: null,
	};
	await ctx.db
		.update(driveItems)
		.set({
			size: row.size,
			updatedAt: row.updatedAt,
			uploadFingerprint: null,
			uploadId: null,
			uploadPartSize: null,
		})
		.where(eq(driveItems.id, ctx.item.id));
	await ctx.db
		.delete(driveUploadParts)
		.where(eq(driveUploadParts.itemId, ctx.item.id));
	const [item] = await toDriveItemDtos(
		ctx.db,
		[row],
		ctx.user.id,
		() => ctx.role
	);
	return Response.json({ item });
}

/** Abandons an upload and discards what was sent. */
export async function DELETE(request: Request, { params }: DriveItemParams) {
	const ctx = await loadPending(request, params);
	if (ctx.error) {
		return ctx.error;
	}
	await ctx.upload.abort().catch(() => {
		/* empty */
	});
	await ctx.db
		.delete(driveUploadParts)
		.where(eq(driveUploadParts.itemId, ctx.item.id));
	await ctx.db.delete(driveItems).where(eq(driveItems.id, ctx.item.id));
	return Response.json({ ok: true });
}
