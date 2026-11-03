import { authorizeDrive, driveResponse } from "@/lib/drive/auth";
import { applyDriveBulkAction } from "@/lib/drive/items";

/** `{ action: "trash" | "restore" | "move" | "delete", ids, parentId? }`; see applyDriveBulkAction. */
export async function POST(request: Request) {
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	const body = (await request.json().catch(() => ({}))) as {
		action?: unknown;
		ids?: unknown;
		parentId?: unknown;
	};
	return driveResponse(() =>
		applyDriveBulkAction(auth.env, auth.user.id, {
			action: body.action,
			ids: body.ids,
			parentId: body.parentId,
		})
	);
}
