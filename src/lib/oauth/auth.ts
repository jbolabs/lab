import { resolveMcpKey } from "@/lib/mcp/auth";
import { canonicalOrigin, hash, now } from "./config";
import { OAuthStore, type Token } from "./store";

export async function authenticateOAuth(env: CloudflareEnv, request: Request, token: string) {
	if (token.length > 256) return null;
	const resource = `${canonicalOrigin(env, request)}/mcp`;
	const store = new OAuthStore(env.DB);
	const row = await store.db.prepare("SELECT * FROM oauth_tokens WHERE access_hash = ? AND access_expires_at > ?").bind(await hash(token), now()).first<Token>();
	if (!row || !await store.grant(row.key_id, resource)) return null;
	const principal = await resolveMcpKey(env, row.key_id);
	if (!principal) return null;
	const granted: string[] = JSON.parse(row.scopes);
	return { ...principal, scopes: principal.scopes.filter((scope) => granted.includes(scope)) };
}
