import { authorizeDrive, driveResponse } from "@/lib/drive/auth";
import {
	cancelDriveUpload,
	completeDriveUpload,
	getPendingDriveUpload,
	uploadDrivePart,
} from "@/lib/drive/uploads";

import type { DriveItemParams } from "../../items/[id]/types";

/** Which parts of an upload are still missing. */
export async function GET(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request);
	if (auth.error) {
		return auth.error;
	}
	return driveResponse(() => getPendingDriveUpload(auth.env, auth.user.id, id));
}

/** Uploads part `?part=N` as the raw request body. Also accepts a signed part URL (`?token=`). */
export async function PUT(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true, {
		transfer: { action: "upload", itemId: id },
	});
	if (auth.error) {
		return auth.error;
	}
	return driveResponse(() =>
		uploadDrivePart(
			auth.env,
			auth.user.id,
			id,
			Number(new URL(request.url).searchParams.get("part")),
			request.body,
			Number(request.headers.get("content-length"))
		)
	);
}

/** Finishes the upload from the recorded parts and makes the file visible. */
export async function POST(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	return driveResponse(() => completeDriveUpload(auth.env, auth.user.id, id));
}

/** Abandons an upload and discards what was sent. */
export async function DELETE(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	return driveResponse(() => cancelDriveUpload(auth.env, auth.user.id, id));
}
