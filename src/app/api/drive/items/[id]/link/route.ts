import { authorizeDrive, driveResponse } from "@/lib/drive/auth";
import { setDriveLink } from "@/lib/drive/sharing";

import type { DriveItemParams } from "../types";

/** Turns the "anyone with the link can view" URL on or off. Turning it off invalidates the old token. */
export async function POST(request: Request, { params }: DriveItemParams) {
	const { id } = await params;
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	const body = (await request.json().catch(() => ({}))) as {
		enabled?: unknown;
	};
	return driveResponse(() =>
		setDriveLink(auth.env, auth.user.id, id, !!body.enabled)
	);
}
