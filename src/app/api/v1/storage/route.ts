import { authenticateAdminApiKey } from "@/lib/api/admin-auth";
import { getEnv } from "@/lib/cloudflare";
import { describeB2Problem, getStorageStatus } from "@/lib/storage/b2-config";
import { testStorage } from "@/lib/storage/health";

/** Which object storage is active. Credentials are never returned. */
export async function GET(request: Request) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "storage");
	if (!auth) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	return Response.json({
		storage: getStorageStatus(env),
		warning: describeB2Problem(env),
	});
}

/** Round-trips a small object through the active storage. */
export async function POST(request: Request) {
	const env = getEnv();
	const auth = await authenticateAdminApiKey(env, request, "storage");
	if (!auth) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const result = await testStorage(env);
	return Response.json(
		{ storage: getStorageStatus(env), ...result },
		{ status: result.ok ? 200 : 502 }
	);
}
