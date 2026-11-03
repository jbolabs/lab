import { authorizeDrive, driveResponse } from "@/lib/drive/auth";
import {
	getDriveSharing,
	shareDriveItem,
	unshareDriveItem,
} from "@/lib/drive/sharing";

import type { DriveItemParams } from "../types";

export async function GET(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request);
	if (auth.error) {
		return auth.error;
	}
	return driveResponse(() => getDriveSharing(auth.env, auth.user.id, id));
}

/** Shares with an account by `email` as `view` or `edit`, or changes an existing share's role. */
export async function POST(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	const body = (await request.json().catch(() => ({}))) as {
		email?: unknown;
		role?: unknown;
	};
	return driveResponse(() => shareDriveItem(auth.env, auth.user.id, id, body));
}

/** Stops sharing, by `?shareId=` or `?email=`. */
export async function DELETE(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	const url = new URL(request.url);
	const shareId = url.searchParams.get("shareId");
	const email = url.searchParams.get("email");
	if (!shareId && !email) {
		return Response.json({ error: "Missing share" }, { status: 400 });
	}
	return driveResponse(() =>
		unshareDriveItem(auth.env, auth.user.id, id, { email, shareId })
	);
}
