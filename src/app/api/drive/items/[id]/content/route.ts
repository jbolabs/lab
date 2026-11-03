import { getDriveItem, getDriveRole } from "@/lib/drive/access";
import { authorizeDrive } from "@/lib/drive/auth";
import { streamDriveFile } from "@/lib/drive/content";

import type { DriveItemParams } from "../types";

/** Streams a file, with `Range` support. Also served to a signed download URL (`?token=`). */
export async function GET(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, false, {
		transfer: { action: "download", itemId: id },
	});
	if (auth.error) {
		return auth.error;
	}
	const { env, db, user } = auth;
	const item = await getDriveItem(db, id);
	if (!item || item.uploadId || !(await getDriveRole(db, user.id, item))) {
		return new Response("Not found", { status: 404 });
	}
	return streamDriveFile(
		env,
		request,
		item,
		new URL(request.url).searchParams.get("download") === "1"
	);
}
