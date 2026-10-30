import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { agentSendApprovals, apiKeys } from "@/db/schema";
import { generateApiKey, parseScopes, scopesToJson } from "@/lib/api-keys";
import { requireSessionUser } from "@/lib/api/auth";
import { ADMIN_API_KEY_SCOPES } from "@/lib/api/scopes";
import { isPrimaryAdmin } from "@/lib/auth/admin";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import { newId } from "@/lib/ids";

const adminScopes = new Set<string>(ADMIN_API_KEY_SCOPES);
const createKeySchema = z.object({
	mcpAllowed: z.boolean().default(false),
	name: z.string().trim().min(1).max(100),
	scopes: z.array(z.enum([...ADMIN_API_KEY_SCOPES])).min(1),
});

async function authorize(request: Request) {
	const env = getEnv();
	const session = await requireSessionUser(env, request);
	if (session.error) {
		return { env, error: session.error, user: null };
	}
	if (!isPrimaryAdmin(session.user)) {
		return {
			env,
			error: Response.json({ error: "Forbidden" }, { status: 403 }),
			user: null,
		};
	}
	return { env, error: null, user: session.user };
}

export async function GET(request: Request) {
	const access = await authorize(request);
	if (access.error) {
		return access.error;
	}
	const rows = await getDb(access.env)
		.select({
			createdAt: apiKeys.createdAt,
			id: apiKeys.id,
			kind: apiKeys.kind,
			lastUsedAt: apiKeys.lastUsedAt,
			name: apiKeys.name,
			prefix: apiKeys.prefix,
			scopes: apiKeys.scopes,
		})
		.from(apiKeys)
		.where(eq(apiKeys.userId, access.user.id));
	return Response.json({
		apiKeys: rows
			.filter((row) => !row.id.startsWith("oauth_"))
			.map((row) => ({
				...row,
				scopes: scopesToJson(
					parseScopes(row.scopes).filter((scope) => adminScopes.has(scope))
				),
			}))
			.filter((row) => parseScopes(row.scopes).length > 0),
	});
}

export async function POST(request: Request) {
	const access = await authorize(request);
	if (access.error) {
		return access.error;
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const parsed = createKeySchema.safeParse(
		await request.json().catch(() => null)
	);
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}
	const db = getDb(access.env);
	const { fullKey, prefix, hash } = generateApiKey();
	const id = newId("key");
	await db.insert(apiKeys).values({
		id,
		keyHash: hash,
		kind: parsed.data.mcpAllowed ? "mcp" : "legacy",
		name: parsed.data.name,
		prefix,
		scopes: scopesToJson([...new Set(parsed.data.scopes)]),
		userId: access.user.id,
	});
	return Response.json({ key: fullKey });
}

export async function DELETE(request: Request) {
	const access = await authorize(request);
	if (access.error) {
		return access.error;
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const id = new URL(request.url).searchParams.get("id");
	if (!id) {
		return Response.json({ error: "Key required" }, { status: 400 });
	}
	const db = getDb(access.env);
	const [key] = await db
		.select({ id: apiKeys.id, scopes: apiKeys.scopes })
		.from(apiKeys)
		.where(and(eq(apiKeys.id, id), eq(apiKeys.userId, access.user.id)))
		.limit(1);
	if (
		!key ||
		!parseScopes(key.scopes).some((scope) => adminScopes.has(scope))
	) {
		return Response.json({ error: "Key not found" }, { status: 404 });
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
	await db.delete(apiKeys).where(eq(apiKeys.id, id));
	return Response.json({ ok: true });
}
