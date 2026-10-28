import { ADMIN_API_KEY_SCOPES } from "@/lib/api/scopes";

export const MAIL_SCOPES = ["mcp:read", "mcp:draft", "mcp:organize", "mcp:request-send", "mcp:calendar-read", "mcp:calendar-write"];
export const DEFAULT_MCP_SCOPE = [...MAIL_SCOPES, "offline_access"].join(" ");
export const OAUTH_SCOPES = [...MAIL_SCOPES, ...ADMIN_API_KEY_SCOPES, "offline_access"];
export const ACCESS_SECONDS = 15 * 60;
export const GRANT_SECONDS = 30 * 24 * 60 * 60;
export const now = () => Math.floor(Date.now() / 1000);
export const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
export async function hash(value: string) {
	return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join("");
}
export class OAuthFailure extends Error {
	constructor(public error: string, message: string, public status = 400) { super(message); }
}
export function canonicalOrigin(env: Pick<CloudflareEnv, "APP_URL">, request: Request) {
	const url = new URL(env.APP_URL || request.url);
	if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new OAuthFailure("server_error", "OAuth requires HTTPS", 503);
	if (url.host !== (request.headers.get("Host") ?? new URL(request.url).host)) throw new OAuthFailure("invalid_request", "Invalid host");
	return url.origin;
}
export function parseScope(value: string | null) {
	const scopes = [...new Set((value ?? DEFAULT_MCP_SCOPE).split(" ").filter(Boolean))];
	if (!scopes.length || scopes.some((scope) => !OAUTH_SCOPES.includes(scope))) throw new OAuthFailure("invalid_scope", "Unsupported permissions");
	const permissions = scopes.filter((scope) => scope !== "offline_access");
	if (!permissions.length || (permissions.some((scope) => MAIL_SCOPES.includes(scope)) && permissions.some((scope) => !MAIL_SCOPES.includes(scope)))) throw new OAuthFailure("invalid_scope", "Mail and admin permissions require separate connections");
	return scopes;
}
export function validRedirect(value: string) {
	try {
		const url = new URL(value);
		return !url.hash && !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)));
	} catch { return false; }
}
export function uniqueParameters(params: URLSearchParams) {
	for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new OAuthFailure("invalid_request", "Duplicate parameter");
	return Object.fromEntries(params);
}
export function oauthJson(body: unknown, status = 200, extra: Record<string, string> = {}) {
	return Response.json(body, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache", "Access-Control-Allow-Origin": "*", ...extra } });
}
export function oauthError(error: unknown) {
	if (error instanceof OAuthFailure) return oauthJson({ error: error.error, error_description: error.message }, error.status);
	// Never include library errors or request bodies in logs: they may carry credentials.
	return oauthJson({ error: "server_error", error_description: "Authorization is temporarily unavailable" }, 500);
}
export function preflight() {
	return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "600" } });
}
