import { authenticateApiKeyValue } from "@/lib/api/key-auth";
import type { ApiAuthResult } from "@/lib/api/key-auth-types";
import { getCurrentUser } from "@/lib/auth/cookies";

export async function authenticateApiKey(
	env: CloudflareEnv,
	authorization: string | null
): Promise<ApiAuthResult | null> {
	if (!authorization?.startsWith("Bearer ")) {
		return null;
	}
	return await authenticateApiKeyValue(env, authorization.slice(7));
}

/**
 * Session auth for route handlers. `requireUser` throws a bare Error, which a server would turn into
 * a 500; this returns a proper 401 response instead so unauthenticated callers get the right
 * status.
 */
export async function requireSessionUser(env: CloudflareEnv, request: Request) {
	const user = await getCurrentUser(env, request);
	if (!user) {
		return {
			error: Response.json({ error: "Unauthorized" }, { status: 401 }),
			user: null,
		} as const;
	}
	return { error: null, user } as const;
}

export { type ApiAuthResult } from "@/lib/api/key-auth-types";

export { hasScope as requireScope } from "@/lib/api/key-auth";
