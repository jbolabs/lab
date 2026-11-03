import { authorizeDrive, driveResponse } from "@/lib/drive/auth";
import { parseDriveCategories } from "@/lib/drive/categories";
import { createDriveFolder, listDriveView } from "@/lib/drive/items";
import type { DriveView } from "@/lib/drive/items";

/** Lists a folder (`parent`), My Drive (searched with `q`), `view=shared`, `view=trash` or `view=attachments`. */
export async function GET(request: Request) {
	const auth = await authorizeDrive(request);
	if (auth.error) {
		return auth.error;
	}
	const url = new URL(request.url);
	return driveResponse(() =>
		listDriveView(auth.env, auth.user, {
			attachments: auth.via === "session",
			parentId: url.searchParams.get("parent"),
			query: url.searchParams.get("q"),
			types: parseDriveCategories(url.searchParams.get("types")),
			view: (url.searchParams.get("view") ?? "my") as DriveView,
		})
	);
}

/** Creates a folder. */
export async function POST(request: Request) {
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	const body = (await request.json().catch(() => ({}))) as {
		name?: unknown;
		parentId?: unknown;
	};
	return driveResponse(() =>
		createDriveFolder(auth.env, auth.user.id, {
			name: body.name,
			parentId: typeof body.parentId === "string" ? body.parentId : null,
		})
	);
}
