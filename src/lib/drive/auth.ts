import { getDb } from "@/db";
import { requireSessionUser } from "@/lib/api/auth";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";

export async function authorizeDrive(request: Request, mutation = false) {
	const env = getEnv();
	const { user, error } = await requireSessionUser(env, request);
	if (error) {
		return { error } as const;
	}
	if (mutation && !hasValidSessionMutationOrigin(request)) {
		return {
			error: Response.json({ error: "Invalid origin" }, { status: 403 }),
		} as const;
	}
	return { db: getDb(env), env, error: null, user } as const;
}
