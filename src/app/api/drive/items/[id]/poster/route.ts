import { getDriveItem, getDriveRole } from "@/lib/drive/access";
import { authorizeDrive } from "@/lib/drive/auth";
import {
	canEditDrive,
	DRIVE_POSTER_MAX_BYTES,
	drivePosterKey,
} from "@/lib/drive/utils";

import type { DriveItemParams } from "../types";

async function findVideo(request: Request, id: string, mutation: boolean) {
	const auth = await authorizeDrive(request, mutation);
	if (auth.error) {
		return { error: auth.error } as const;
	}
	const item = await getDriveItem(auth.db, id);
	const role = item ? await getDriveRole(auth.db, auth.user.id, item) : null;
	if (
		!item ||
		!role ||
		item.trashedAt ||
		item.kind !== "file" ||
		!item.contentType.startsWith("video/") ||
		(mutation && !canEditDrive(role))
	) {
		return {
			error: Response.json({ error: "Not found" }, { status: 404 }),
		} as const;
	}
	return {
		env: auth.env,
		error: null,
		key: drivePosterKey(item.ownerId, item.id),
	} as const;
}

/** The video's poster frame, or 404 when none has been captured yet. */
export async function GET(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const found = await findVideo(request, id, false);
	if (found.error) {
		return found.error;
	}
	const object = await found.env.BUCKET.get(found.key);
	if (!object) {
		return new Response("Not found", { status: 404 });
	}
	return new Response(object.body, {
		headers: {
			"Cache-Control": "private, no-cache",
			"Content-Type": "image/jpeg",
		},
	});
}

/** Stores a JPEG frame the owner's browser captured from the video. */
export async function PUT(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const found = await findVideo(request, id, true);
	if (found.error) {
		return found.error;
	}
	const bytes = new Uint8Array(await request.arrayBuffer());
	const isJpeg =
		bytes.length > 3 &&
		bytes[0] === 0xff &&
		bytes[1] === 0xd8 &&
		bytes[2] === 0xff;
	if (!isJpeg || bytes.length > DRIVE_POSTER_MAX_BYTES) {
		return Response.json({ error: "Invalid poster" }, { status: 400 });
	}
	await found.env.BUCKET.put(found.key, bytes, {
		httpMetadata: { contentType: "image/jpeg" },
	});
	return new Response(null, { status: 204 });
}
