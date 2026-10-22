import { getDb } from "@/db";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";
import type { SessionUser } from "@/lib/auth/types";
import { generateApiKey } from "@/lib/api-keys";
import { ADMIN_API_KEY_SCOPES } from "@/lib/api/scopes";
import { GRANT_SECONDS, hash, MAIL_SCOPES, now, OAuthFailure, parseScope, secret } from "./config";
import { OAuthStore, type Pending } from "./store";

export async function consentDetails(env: CloudflareEnv, pending: Pending, user: SessionUser) {
	const p = JSON.parse(pending.parameters) as Record<string, string>;
	const store = new OAuthStore(env.DB);
	const client = await store.client(p.client_id);
	if (!client) throw new OAuthFailure("invalid_client", "This connection request is no longer available");
	const scopes = parseScope(p.scope);
	if (scopes.some((scope) => (ADMIN_API_KEY_SCOPES as readonly string[]).includes(scope)) && user.role !== "admin") throw new OAuthFailure("access_denied", "Only administrators can approve these permissions", 403);
	return { client, parameters: p, scopes };
}
export async function completeConsent(env: CloudflareEnv, user: SessionUser, ticket: string, decision: string, selectedScopes: string[], mailboxIds: string[]) {
	const store = new OAuthStore(env.DB);
	const pending = await store.pending(ticket, user.id);
	if (!pending) throw new OAuthFailure("invalid_request", "This request expired. Reconnect from your assistant.");
	const { parameters: p, scopes: requested } = await consentDetails(env, pending, user);
	const redirect = new URL(p.redirect_uri);
	redirect.searchParams.delete("code");
	redirect.searchParams.delete("error");
	if (p.state !== undefined) redirect.searchParams.set("state", p.state);
	redirect.searchParams.set("iss", new URL(p.resource).origin);
	if (decision === "deny") {
		if (!await store.consumePending(ticket, user.id)) throw new OAuthFailure("invalid_request", "Request already completed");
		redirect.searchParams.set("error", "access_denied");
		return redirect.toString();
	}
	if (decision !== "allow") throw new OAuthFailure("invalid_request", "Choose Allow or Deny");
	const scopes = [...new Set(selectedScopes)];
	if (scopes.some((scope) => !requested.includes(scope)) || !scopes.some((scope) => scope !== "offline_access")) throw new OAuthFailure("invalid_scope", "Choose at least one requested permission");
	const permissions = scopes.filter((scope) => scope !== "offline_access");
	const ids = [...new Set(mailboxIds)];
	if (ids.length > 30 || (permissions.some((scope) => MAIL_SCOPES.includes(scope) && !scope.startsWith("mcp:calendar-")) && !ids.length)) throw new OAuthFailure("invalid_request", "Choose at least one mailbox for mail access");
	if (!permissions.some((scope) => MAIL_SCOPES.includes(scope)) && ids.length) throw new OAuthFailure("invalid_request", "Admin connections cannot read mailboxes");
	for (const id of ids) if (!(await getMailboxAccessLevel(getDb(env), user, id))?.canRead) throw new OAuthFailure("access_denied", "Mailbox access has changed", 403);
	if (!await store.consumePending(ticket, user.id)) throw new OAuthFailure("invalid_request", "Request already completed");
	const keyId = `oauth_${secret()}`;
	const code = secret();
	// A discarded random key supplies the existing stable approval/audit identity. OAuth clients never receive it.
	const key = generateApiKey();
	await env.DB.batch([
		env.DB.prepare("INSERT INTO api_keys(id, kind, user_id, name, prefix, key_hash, scopes, mailbox_scope_enabled, created_at) VALUES (?, 'mcp', ?, ?, ?, ?, ?, 1, ?)")
			.bind(keyId, user.id, (await store.client(p.client_id))!.name, key.prefix, key.hash, JSON.stringify(permissions), now()),
		env.DB.prepare("INSERT INTO oauth_grants(key_id, client_id, resource, expires_at) VALUES (?, ?, ?, ?)").bind(keyId, p.client_id, p.resource, now() + GRANT_SECONDS),
		...ids.map((id) => env.DB.prepare("INSERT INTO mcp_key_mailboxes(key_id, mailbox_id) VALUES (?, ?)").bind(keyId, id)),
		env.DB.prepare("INSERT INTO oauth_codes(hash, key_id, redirect_uri, challenge, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(await hash(code), keyId, p.redirect_uri, p.code_challenge, JSON.stringify(scopes), now() + 300),
	]);
	redirect.searchParams.set("code", code);
	return redirect.toString();
}
