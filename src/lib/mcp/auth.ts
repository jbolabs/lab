import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { verifyApiKey } from "@/lib/api-keys";
import { authenticateOAuth } from "@/lib/oauth/auth";

import { resolveMcpKey } from "./key-resolution";
import type { McpPrincipal } from "./types";

export async function authenticateMcpRequest(
	env: CloudflareEnv,
	request: Request
): Promise<McpPrincipal | null> {
	const authorization = request.headers.get("Authorization") ?? "";
	if (!authorization.startsWith("Bearer ")) {
		return null;
	}
	const key = authorization.slice(7).trim();
	if (key.startsWith("mf_at_")) {
		return authenticateOAuth(env, request, key);
	}
	if (!key.startsWith("ep_") || key.length > 256) {
		return null;
	}
	const db = getDb(env);
	const candidates = await db
		.select()
		.from(apiKeys)
		.where(and(eq(apiKeys.prefix, key.slice(0, 12)), eq(apiKeys.kind, "mcp")));
	for (const candidate of candidates) {
		if (!verifyApiKey(key, candidate.keyHash)) {
			continue;
		}
		return resolveMcpKey(env, candidate.id);
	}
	return null;
}

export { resolveMcpKey } from "./key-resolution";
