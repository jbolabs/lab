CREATE TABLE oauth_clients (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, redirect_uris TEXT NOT NULL, grants TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE oauth_grants (
 key_id TEXT PRIMARY KEY NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
 client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
 resource TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
);
--> statement-breakpoint
CREATE TABLE oauth_requests (
 hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 parameters TEXT NOT NULL, expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE oauth_codes (
 hash TEXT PRIMARY KEY NOT NULL, key_id TEXT NOT NULL REFERENCES oauth_grants(key_id) ON DELETE CASCADE,
 redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, scopes TEXT NOT NULL,
 expires_at INTEGER NOT NULL, consumed_at INTEGER
);
--> statement-breakpoint
CREATE TABLE oauth_tokens (
 access_hash TEXT PRIMARY KEY NOT NULL, refresh_hash TEXT NOT NULL UNIQUE,
 key_id TEXT NOT NULL REFERENCES oauth_grants(key_id) ON DELETE CASCADE,
 scopes TEXT NOT NULL, access_expires_at INTEGER NOT NULL, refresh_expires_at INTEGER NOT NULL,
 consumed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX oauth_tokens_grant_idx ON oauth_tokens(key_id);
--> statement-breakpoint
CREATE INDEX oauth_codes_grant_idx ON oauth_codes(key_id);
--> statement-breakpoint
CREATE TABLE oauth_rate_limits (id TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
