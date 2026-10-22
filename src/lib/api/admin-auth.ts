import { getInternalMcpPrincipal } from "@/lib/mcp/admin-auth";
import { authenticateApiKey } from "@/lib/api/auth";
import type { ApiAuthResult } from "@/lib/api/key-auth-types";
import type { AdminApiKeyScope } from "@/lib/api/scopes-types";
import { getLicenseEntitlements } from "@/lib/licenses/service";

export async function authenticateAdminApiKey(env: CloudflareEnv, request: Request, scope: AdminApiKeyScope): Promise<ApiAuthResult | null> {
	const principal = getInternalMcpPrincipal(request);
	if (principal) return principal.user.role === "admin" && principal.scopes.includes(scope)
		? { keyId: principal.keyId, keyKind: "mcp", userId: principal.user.id, email: principal.user.email, user: principal.user, scopes: principal.scopes, mailboxIds: principal.mailboxIds } : null;
	const auth = await authenticateApiKey(env, request.headers.get("authorization"));
	return auth?.user.role === "admin" && auth.scopes.includes(scope) ? auth : null;
}

export async function canShareAdminMailboxes(env: CloudflareEnv): Promise<boolean> {
	return (await getLicenseEntitlements(env)).canShareMailboxes;
}

export async function canManageAdminAccounts(env: CloudflareEnv): Promise<boolean> {
	return (await getLicenseEntitlements(env)).canManageAccounts;
}
