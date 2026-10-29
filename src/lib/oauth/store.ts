import { isNodeRuntime } from "@/lib/runtime";

import { hash, now, OAuthFailure } from "./config";

export interface Client {
	id: string;
	name: string;
	redirect_uris: string;
	grants: string;
	created_at: number;
}

export interface Grant {
	key_id: string;
	client_id: string;
	resource: string;
	expires_at: number;
	revoked_at: number | null;
	scopes: string;
	user_id: string;
}

export interface Code {
	hash: string;
	key_id: string;
	redirect_uri: string;
	challenge: string;
	scopes: string;
	expires_at: number;
	consumed_at: number | null;
}

export interface Token {
	access_hash: string;
	refresh_hash: string;
	key_id: string;
	scopes: string;
	access_expires_at: number;
	refresh_expires_at: number;
	consumed_at: number | null;
}

export interface Pending {
	hash: string;
	user_id: string;
	parameters: string;
	expires_at: number;
}

/** D1 also backs Node's SQLite adapter. Atomic UPDATE/DELETE RETURNING prevents replay across isolates. */
export class OAuthStore {
	public db: D1Database;
	constructor(db: D1Database) {
		this.db = db;
	}
	async client(id: string) {
		return await this.db
			.prepare("SELECT * FROM oauth_clients WHERE id = ?")
			.bind(id)
			.first<Client>();
	}
	async grant(id: string, resource: string) {
		return await this.db
			.prepare(`SELECT g.*, k.scopes, k.user_id FROM oauth_grants g JOIN api_keys k ON k.id = g.key_id JOIN users u ON u.id = k.user_id
		 WHERE g.key_id = ? AND g.resource = ? AND g.revoked_at IS NULL AND g.expires_at > ? AND u.disabled = 0 AND k.kind = 'mcp'`)
			.bind(id, resource, now())
			.first<Grant>();
	}
	async pending(ticket: string, userId: string) {
		return this.db
			.prepare(
				"SELECT * FROM oauth_requests WHERE hash = ? AND user_id = ? AND expires_at > ?"
			)
			.bind(await hash(ticket), userId, now())
			.first<Pending>();
	}
	async consumePending(ticket: string, userId: string) {
		return this.db
			.prepare(
				"DELETE FROM oauth_requests WHERE hash = ? AND user_id = ? AND expires_at > ? RETURNING *"
			)
			.bind(await hash(ticket), userId, now())
			.first<Pending>();
	}
	async revoke(id: string) {
		await this.db.batch([
			this.db
				.prepare(
					"UPDATE oauth_grants SET revoked_at = ? WHERE key_id = ? AND revoked_at IS NULL"
				)
				.bind(now(), id),
			this.db
				.prepare(
					"UPDATE agent_send_approvals SET status = 'cancelled' WHERE request_key_id = ? AND status = 'pending'"
				)
				.bind(id),
		]);
	}
	async rateLimit(request: Request, purpose: string, maximum: number) {
		// Workers supplies a trusted IP; Node shares a conservative global budget rather than trusting spoofable proxy headers.
		const ip = isNodeRuntime()
			? "local"
			: request.headers.get("cf-connecting-ip") || "local";
		const bucket = Math.floor(now() / 3600);
		const id = `${purpose}:${bucket}:${await hash(ip)}`;
		const row = await this.db
			.prepare(`INSERT INTO oauth_rate_limits(id, attempts, expires_at) VALUES (?, 1, ?)
		 ON CONFLICT(id) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`)
			.bind(id, (bucket + 2) * 3600)
			.first<{ attempts: number }>();
		if (!row || row.attempts > maximum) {
			throw new OAuthFailure(
				"temporarily_unavailable",
				"Too many authorization attempts. Try again later.",
				429
			);
		}
	}
	async cleanup() {
		await this.db.batch([
			this.db
				.prepare("DELETE FROM oauth_requests WHERE expires_at < ?")
				.bind(now()),
			this.db
				.prepare("DELETE FROM oauth_codes WHERE expires_at < ?")
				.bind(now() - 86_400),
			this.db
				.prepare("DELETE FROM oauth_tokens WHERE refresh_expires_at < ?")
				.bind(now()),
			this.db
				.prepare("DELETE FROM oauth_rate_limits WHERE expires_at < ?")
				.bind(now()),
		]);
	}
}
