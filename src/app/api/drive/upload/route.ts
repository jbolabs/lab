import { authorizeDrive, driveResponse } from "@/lib/drive/auth";
import { startDriveUpload } from "@/lib/drive/uploads";

/**
 * Starts an upload: `{ name, size, contentType?, parentId?, fingerprint? }`. The file itself is then sent as raw
 * (non multipart/form-data) PUT requests, because the runtime treats every multipart POST as a server action and
 * rejects bodies over 1 MB.
 */
export async function POST(request: Request) {
	const auth = await authorizeDrive(request, true);
	if (auth.error) {
		return auth.error;
	}
	const body = (await request.json().catch(() => ({}))) as Record<
		string,
		unknown
	>;
	return driveResponse(() =>
		startDriveUpload(auth.env, auth.user.id, {
			contentType: body.contentType,
			fingerprint: body.fingerprint,
			name: body.name,
			parentId: body.parentId,
			size: body.size,
		})
	);
}
