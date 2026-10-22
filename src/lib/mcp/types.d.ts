import type { users } from "@/db/schema";

export type McpPrincipal = {
	keyId: string;
	user: typeof users.$inferSelect;
	scopes: string[];
	mailboxIds: string[];
};
