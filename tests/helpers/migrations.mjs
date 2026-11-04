import { readdirSync, readFileSync } from "node:fs";

const directory = new URL("../../drizzle/migrations/", import.meta.url);

/** The repository's D1 migrations in the order Alchemy applies them. */
export const migrations = readdirSync(directory)
	.filter((name) => name.endsWith(".sql"))
	.toSorted()
	.map((name) => ({
		name,
		sql: readFileSync(new URL(name, directory), "utf-8"),
	}));
