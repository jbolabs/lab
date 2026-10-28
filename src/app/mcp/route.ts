import { canonicalOrigin, DEFAULT_MCP_SCOPE } from "@/lib/oauth/config";
import { getEnv } from "@/lib/cloudflare";
import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { createMailflareMcpHandler } from "@/lib/mcp/server";
import { allowAgentRequest } from "@/lib/agent/rate-limit";

async function handle(request: Request) {
	const env = getEnv();
	let baseUrl: string;
	try { baseUrl = canonicalOrigin(env, request); } catch { return new Response("Invalid host", { status: 403 }); }
	const origin = request.headers.get("Origin");
	if (origin && origin !== baseUrl) return new Response("Invalid origin", { status: 403 });
	const principal = await authenticateMcpRequest(env, request);
	if (!principal) return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp", scope="${DEFAULT_MCP_SCOPE}"` } });
	if (!await allowAgentRequest(env, `mcp:${principal.keyId}`)) return new Response("Rate limit exceeded", { status: 429 });
	const handler = createMailflareMcpHandler(env, principal, baseUrl, request.headers.get("Authorization") ?? "");
	try { return await handler.fetch(request); }
	finally { await handler.close(); }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
