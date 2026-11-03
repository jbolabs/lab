/**
 * Scopes an API key can be granted. Kept free of server-only imports so the
 * dashboard's key-creation form can import it without pulling in bcrypt.
 * Administrative scopes are issued separately from personal mail keys.
 */
export const API_KEY_SCOPES = [
	"send",
	"read",
	"jmap",
	"calendar:read",
	"calendar:write",
	"drive:read",
	"drive:write",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/**
 * Calendar and Drive belong to the account rather than a mailbox, so a key holding only those scopes needs no
 * mailbox. Covers personal (`drive:read`) and MCP (`mcp:drive-read`) spellings.
 */
export function scopeNeedsMailbox(scope: string): boolean {
	return !/^(?:mcp:)?(?:calendar|drive)[:-]/u.test(scope);
}

export const ADMIN_API_KEY_SCOPES = [
	"domains",
	"accounts",
	"mailboxes",
	"storage",
] as const;
