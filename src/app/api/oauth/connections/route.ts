import { getCurrentUser } from "@/lib/auth/cookies";
import { hasValidSessionMutationOrigin } from "@/lib/auth/origin";
import { getEnv } from "@/lib/cloudflare";
import { now } from "@/lib/oauth/config";
import { OAuthStore } from "@/lib/oauth/store";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { results } =
		await env.DB.prepare(`SELECT g.key_id AS id, c.name, k.scopes, k.created_at AS createdAt, k.last_used_at AS lastUsedAt, g.expires_at AS expiresAt
	 FROM oauth_grants g JOIN api_keys k ON k.id = g.key_id JOIN oauth_clients c ON c.id = g.client_id
	 WHERE k.user_id = ? AND g.revoked_at IS NULL AND g.expires_at > ? ORDER BY k.created_at DESC`)
			.bind(user.id, now())
			.all();
	return Response.json(
		{ connections: results },
		{ headers: { "Cache-Control": "no-store" } }
	);
}
export async function DELETE(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!hasValidSessionMutationOrigin(request)) {
		return Response.json({ error: "Invalid origin" }, { status: 403 });
	}
	const id = new URL(request.url).searchParams.get("id") || "";
	const owned = await env.DB.prepare(
		"SELECT g.key_id FROM oauth_grants g JOIN api_keys k ON k.id = g.key_id WHERE g.key_id = ? AND k.user_id = ?"
	)
		.bind(id, user.id)
		.first();
	if (!owned) {
		return Response.json({ error: "Connection not found" }, { status: 404 });
	}
	await new OAuthStore(env.DB).revoke(id);
	return Response.json({ ok: true });
}
