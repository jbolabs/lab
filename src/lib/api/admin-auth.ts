import { authenticateApiKey } from "@/lib/api/auth";
import type { ApiAuthResult } from "@/lib/api/key-auth-types";
import type { AdminApiKeyScope } from "@/lib/api/scopes-types";
import { getInternalMcpPrincipal } from "@/lib/mcp/admin-auth";

export async function authenticateAdminApiKey(
	env: CloudflareEnv,
	request: Request,
	scope: AdminApiKeyScope
): Promise<ApiAuthResult | null> {
	const principal = getInternalMcpPrincipal(request);
	if (principal) {
		return principal.user.role === "admin" && principal.scopes.includes(scope)
			? {
					email: principal.user.email,
					keyId: principal.keyId,
					keyKind: "mcp",
					mailboxIds: principal.mailboxIds,
					scopes: principal.scopes,
					user: principal.user,
					userId: principal.user.id,
				}
			: null;
	}
	const auth = await authenticateApiKey(
		env,
		request.headers.get("authorization")
	);
	return auth?.user.role === "admin" && auth.scopes.includes(scope)
		? auth
		: null;
}
