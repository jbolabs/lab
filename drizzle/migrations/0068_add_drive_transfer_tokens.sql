CREATE TABLE drive_transfer_tokens (
 token_hash TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 item_id TEXT NOT NULL REFERENCES drive_items(id) ON DELETE CASCADE,
 action TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX drive_transfer_tokens_expiry_idx ON drive_transfer_tokens(expires_at);
