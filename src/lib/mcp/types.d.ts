import type { users } from "@/db/schema";

export interface McpPrincipal {
	keyId: string;
	user: typeof users.$inferSelect;
	scopes: string[];
	mailboxIds: string[];
}
