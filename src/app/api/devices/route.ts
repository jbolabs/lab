import { requireSessionUser } from "@/lib/api/auth";
import { listDeviceKeys } from "@/lib/auth/device-keys";
import { getEnv } from "@/lib/cloudflare";

/** Mobile devices signed in to this account (Settings → Devices). */
export async function GET(request: Request) {
	const env = getEnv();
	const { user, error } = await requireSessionUser(env, request);
	if (error) {
		return error;
	}
	return Response.json({ devices: await listDeviceKeys(env, user.id) });
}
