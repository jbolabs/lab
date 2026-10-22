import OAuth2Server from "@node-oauth/oauth2-server";
import { ACCESS_SECONDS, GRANT_SECONDS, hash, now, secret } from "./config";
import { OAuthStore, type Code, type Token } from "./store";

export function createOAuthServer(store: OAuthStore, resource: string, requestedClientId: string) {
	async function context(keyId: string) {
		const grant = await store.grant(keyId, resource);
		if (!grant || grant.client_id !== requestedClientId) return null;
		const client = await store.client(grant.client_id);
		return client ? { grant, client: { id: client.id, grants: JSON.parse(client.grants) as string[], redirectUris: JSON.parse(client.redirect_uris) as string[] }, user: { grantId: keyId } } : null;
	}
	const model: OAuth2Server.AuthorizationCodeModel & OAuth2Server.RefreshTokenModel = {
		async getAccessToken(value) {
			const row = await store.db.prepare("SELECT * FROM oauth_tokens WHERE access_hash = ? AND access_expires_at > ?").bind(await hash(value), now()).first<Token>();
			const ctx = row ? await context(row.key_id) : null;
			return row && ctx ? { accessToken: value, accessTokenExpiresAt: new Date(row.access_expires_at * 1000), scope: JSON.parse(row.scopes), client: ctx.client, user: ctx.user } : null;
		},
		async getClient(id, clientSecret) {
			// Only public PKCE clients are registered. Reject accidental confidential-client credentials.
			if (id !== requestedClientId || clientSecret) return null;
			const client = await store.client(id);
			return client ? { id, grants: JSON.parse(client.grants) as string[], redirectUris: JSON.parse(client.redirect_uris) } : null;
		},
		async getAuthorizationCode(value) {
			const row = await store.db.prepare("SELECT * FROM oauth_codes WHERE hash = ? AND consumed_at IS NULL").bind(await hash(value)).first<Code>();
			if (!row) return null;
			const ctx = await context(row.key_id);
			return ctx ? { authorizationCode: value, expiresAt: new Date(row.expires_at * 1000), redirectUri: row.redirect_uri, codeChallenge: row.challenge, codeChallengeMethod: "S256", scope: JSON.parse(row.scopes), client: ctx.client, user: ctx.user } : null;
		},
		async revokeAuthorizationCode(code) {
			return !!await store.db.prepare("UPDATE oauth_codes SET consumed_at = ? WHERE hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING hash").bind(now(), await hash(code.authorizationCode), now()).first();
		},
		async saveAuthorizationCode() { throw new Error("Codes are issued only after browser consent"); },
		async getRefreshToken(value) {
			const row = await store.db.prepare("SELECT * FROM oauth_tokens WHERE refresh_hash = ?").bind(await hash(value)).first<Token>();
			if (!row) return null;
			const ctx = await context(row.key_id);
			if (!ctx) return null;
			if (row.consumed_at !== null) { await store.revoke(row.key_id); return null; }
			return { refreshToken: value, refreshTokenExpiresAt: new Date(row.refresh_expires_at * 1000), scope: JSON.parse(row.scopes), client: ctx.client, user: ctx.user };
		},
		async revokeToken(token) {
			const row = await store.db.prepare("UPDATE oauth_tokens SET consumed_at = ? WHERE refresh_hash = ? AND consumed_at IS NULL AND refresh_expires_at > ? RETURNING key_id").bind(now(), await hash(token.refreshToken), now()).first<{ key_id: string }>();
			if (!row) await store.revoke(String(token.user.grantId));
			return !!row;
		},
		async validateScope(user, _client, scopes) {
			const ctx = await context(String(user.grantId));
			const allowed: string[] = ctx ? JSON.parse(ctx.grant.scopes) : [];
			return scopes?.length && scopes.every((scope) => scope === "offline_access" || allowed.includes(scope)) ? scopes : false;
		},
		async generateAccessToken() { return `mf_at_${secret()}`; },
		async generateRefreshToken(_client, _user, scopes) { return scopes.includes("offline_access") ? `mf_rt_${secret()}` : ""; },
		async saveToken(token, client, user) {
			const keyId = String(user.grantId);
			const ctx = await context(keyId);
			if (!ctx || !token.accessTokenExpiresAt || !token.refreshTokenExpiresAt) throw new OAuth2Server.InvalidGrantError("Connection is no longer authorized");
			const refreshExpiry = Math.min(ctx.grant.expires_at, Math.floor((token.refreshToken ? token.refreshTokenExpiresAt : token.accessTokenExpiresAt).getTime() / 1000));
			const inserted = await store.db.prepare(`INSERT INTO oauth_tokens(access_hash, refresh_hash, key_id, scopes, access_expires_at, refresh_expires_at)
			 SELECT ?, ?, key_id, ?, ?, ? FROM oauth_grants WHERE key_id = ? AND revoked_at IS NULL AND expires_at > ? RETURNING key_id`)
				.bind(await hash(token.accessToken), await hash(token.refreshToken || secret()), JSON.stringify(token.scope), Math.floor(token.accessTokenExpiresAt.getTime() / 1000), refreshExpiry, keyId, now()).first();
			if (!inserted) throw new OAuth2Server.InvalidGrantError("Connection is no longer authorized");
			return { ...token, accessToken: String(token.accessToken), refreshTokenExpiresAt: new Date(refreshExpiry * 1000), client, user };
		},
	};
	return new OAuth2Server({ model, accessTokenLifetime: ACCESS_SECONDS, refreshTokenLifetime: GRANT_SECONDS, requirePKCE: true, requireClientAuthentication: { authorization_code: false, refresh_token: false }, alwaysIssueNewRefreshToken: true });
}
