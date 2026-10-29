import { drizzle } from "drizzle-orm/d1";

import { schema } from "@/db/schema";

export { schema } from "@/db/schema";

export function createDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

export type AppDatabase = ReturnType<typeof createDb>;

export function getDb(env: Pick<CloudflareEnv, "DB">) {
	if (!env.DB) {
		throw new Error("No database binding configured");
	}
	return createDb(env.DB);
}
