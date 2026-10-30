import { requireSessionUser } from "@/lib/api/auth";
import { revokeDeviceKey } from "@/lib/auth/device-keys";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";

/** Signs a device out: its key stops working and its push registration goes. */
export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const env = getEnv();
	const { user, error } = await requireSessionUser(env, request);
	if (error) {
		return error;
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const { id } = await params;
	if (!(await revokeDeviceKey(env, user.id, id))) {
		return Response.json({ error: "Device not found" }, { status: 404 });
	}
	return Response.json({ ok: true });
}
