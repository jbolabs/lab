import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { agentSendApprovals, apiKeys, mcpKeyMailboxes } from "@/db/schema";
import {
	generateApiKey,
	generateAppPassword,
	parseScopes,
	scopesToJson,
} from "@/lib/api-keys";
import { API_KEY_SCOPES, ADMIN_API_KEY_SCOPES } from "@/lib/api/scopes";
import { requireUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import { newId } from "@/lib/ids";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";

const createKeySchema = z.object({
	mailboxIds: z.array(z.string().min(1)).max(30),
	name: z.string().trim().min(1).max(100),
	scopes: z.array(z.enum([...API_KEY_SCOPES])).min(1),
});

export async function GET(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	const db = getDb(env);
	const rows = await db
		.select({
			createdAt: apiKeys.createdAt,
			id: apiKeys.id,
			kind: apiKeys.kind,
			lastUsedAt: apiKeys.lastUsedAt,
			mailboxScopeEnabled: apiKeys.mailboxScopeEnabled,
			name: apiKeys.name,
			prefix: apiKeys.prefix,
			scopes: apiKeys.scopes,
		})
		.from(apiKeys)
		.where(eq(apiKeys.userId, user.id));
	const keyIds = rows.map((row) => row.id);
	const allowed = keyIds.length
		? await db
				.select()
				.from(mcpKeyMailboxes)
				.where(inArray(mcpKeyMailboxes.keyId, keyIds))
		: [];
	return Response.json({
		apiKeys: rows
			.filter(
				(row) =>
					!row.id.startsWith("oauth_") &&
					row.kind !== "device" &&
					!parseScopes(row.scopes).some((scope) =>
						(ADMIN_API_KEY_SCOPES as readonly string[]).includes(scope)
					)
			)
			.map((row) => ({
				...row,
				mailboxIds: allowed
					.filter((item) => item.keyId === row.id)
					.map((item) => item.mailboxId),
			})),
	});
}

export async function POST(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const parsed = createKeySchema.safeParse(
		await request.json().catch(() => null)
	);
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const isAppPassword =
		parsed.data.scopes.length === 1 && parsed.data.scopes[0] === "jmap";
	const { fullKey, prefix, hash } = isAppPassword
		? generateAppPassword()
		: generateApiKey();
	const db = getDb(env);
	const mailboxIds = [...new Set(parsed.data.mailboxIds)];
	if (
		!mailboxIds.length &&
		parsed.data.scopes.some((scope) => !scope.startsWith("calendar:"))
	) {
		return Response.json(
			{ error: "Choose a mailbox for mail permissions" },
			{ status: 400 }
		);
	}
	const mailboxAccess = await Promise.all(
		mailboxIds.map((mailboxId) => getMailboxAccessLevel(db, user, mailboxId))
	);
	if (mailboxAccess.some((access) => !access?.canRead)) {
		return Response.json({ error: "Mailbox not found" }, { status: 403 });
	}
	const id = newId("key");
	await db.insert(apiKeys).values({
		id,
		keyHash: hash,
		mailboxScopeEnabled: true,
		name: parsed.data.name,
		prefix,
		scopes: scopesToJson([...new Set(parsed.data.scopes)]),
		userId: user.id,
	});
	if (mailboxIds.length) {
		await db
			.insert(mcpKeyMailboxes)
			.values(mailboxIds.map((mailboxId) => ({ keyId: id, mailboxId })));
	}

	return Response.json({
		id,
		key: fullKey,
		mailboxIds,
		name: parsed.data.name,
		prefix,
	});
}

export async function DELETE(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const id = new URL(request.url).searchParams.get("id");
	if (!id) {
		return Response.json({ error: "Key required" }, { status: 400 });
	}
	const db = getDb(env);
	const [key] = await db
		.select({ id: apiKeys.id, scopes: apiKeys.scopes })
		.from(apiKeys)
		.where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
		.limit(1);
	if (!key) {
		return Response.json({ error: "Key not found" }, { status: 404 });
	}
	if (
		parseScopes(key.scopes).some((scope) =>
			(ADMIN_API_KEY_SCOPES as readonly string[]).includes(scope)
		)
	) {
		return Response.json(
			{ error: "Manage this key in Admin API keys" },
			{ status: 403 }
		);
	}
	await db
		.update(agentSendApprovals)
		.set({ status: "cancelled" })
		.where(
			and(
				eq(agentSendApprovals.requestKeyId, id),
				eq(agentSendApprovals.status, "pending")
			)
		);
	await db
		.delete(apiKeys)
		.where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)));
	return Response.json({ ok: true });
}
