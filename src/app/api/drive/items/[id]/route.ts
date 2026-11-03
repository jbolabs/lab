import { authorizeDrive, driveResponse } from "@/lib/drive/auth";
import {
	deleteDriveItemForever,
	getDriveItemDetails,
	updateDriveItem,
} from "@/lib/drive/items";

import type { DriveItemParams } from "./types";

/** An item's metadata and its path. */
export async function GET(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request);
	if (auth.error) {
		return auth.error;
	}
	return driveResponse(() => getDriveItemDetails(auth.env, auth.user.id, id));
}

/** Rename, move to trash or restore. */
export async function PATCH(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	const body = (await request.json().catch(() => ({}))) as {
		name?: unknown;
		trashed?: unknown;
	};
	return driveResponse(() => updateDriveItem(auth.env, auth.user.id, id, body));
}

/** Permanently deletes an item the owner has already moved to the trash. */
export async function DELETE(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	return driveResponse(() =>
		deleteDriveItemForever(auth.env, auth.user.id, id)
	);
}
