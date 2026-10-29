import { and, eq, lt, or, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { apiKeys, mcpKeyMailboxes, users } from "@/db/schema";
import { parseScopes } from "@/lib/api-keys";
import { ADMIN_API_KEY_SCOPES } from "@/lib/api/scopes";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";
import { MAIL_SCOPES } from "@/lib/oauth/config";

import type { McpPrincipal } from "./types";

const MCP_SCOPES = new Set(MAIL_SCOPES);

const ADMIN_SCOPES = new Set<string>(ADMIN_API_KEY_SCOPES);

export async function resolveMcpKey(
	env: CloudflareEnv,
	keyId: string
): Promise<McpPrincipal | null> {
	const db = getDb(env);
	const [candidate] = await db
		.select()
		.from(apiKeys)
		.where(and(eq(apiKeys.id, keyId), eq(apiKeys.kind, "mcp")))
		.limit(1);
	if (!candidate) {
		return null;
	}
	const allScopes = parseScopes(candidate.scopes);
	const isMailKey =
		allScopes.length > 0 && allScopes.every((scope) => MCP_SCOPES.has(scope));
	const isAdminKey =
		allScopes.length > 0 && allScopes.every((scope) => ADMIN_SCOPES.has(scope));
	if (!isMailKey && !isAdminKey) {
		return null;
	}
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.id, candidate.userId))
		.limit(1);
	if (!user || user.disabled) {
		return null;
	}
	if (isAdminKey && user.role !== "admin") {
		return null;
	}
	const allowed = isMailKey
		? await db
				.select({ mailboxId: mcpKeyMailboxes.mailboxId })
				.from(mcpKeyMailboxes)
				.where(eq(mcpKeyMailboxes.keyId, candidate.id))
		: [];
	const mailboxIds: string[] = [];
	for (const { mailboxId } of allowed) {
		if (
			await getMailboxAccessLevel(db, user, mailboxId).then(
				(resolved) => resolved?.canRead
			)
		) {
			mailboxIds.push(mailboxId);
		}
	}
	const stale = new Date(Date.now() - 60_000);
	await db
		.update(apiKeys)
		.set({ lastUsedAt: new Date() })
		.where(
			and(
				eq(apiKeys.id, candidate.id),
				or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, stale))
			)
		);
	return { keyId: candidate.id, mailboxIds, scopes: allScopes, user };
}
