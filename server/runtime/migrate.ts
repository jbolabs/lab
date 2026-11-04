import fsPromises from "node:fs/promises";
import nodePath from "node:path";

import type { SqliteDatabase } from "./sqlite-database";

const { readdir, readFile } = fsPromises;
const { join } = nodePath;

/**
 * Apply the repository's D1 migrations to the local database in name order,
 * recording them in `d1_migrations`. A fresh database and an upgraded one
 * follow the same path. On Cloudflare, Alchemy applies the same files in the
 * same order on deploy (`alchemy.run.ts`).
 */
export async function applyMigrations(
	database: SqliteDatabase,
	migrationsDir: string
): Promise<string[]> {
	const { db } = database;
	db.exec(
		"CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
	);
	const applied = new Set(
		db
			.prepare("SELECT name FROM d1_migrations")
			.all()
			.map((row) => (row as { name: string }).name)
	);
	const files = await readdir(migrationsDir);
	const names = files.filter((name) => name.endsWith(".sql")).toSorted();

	const ran: string[] = [];
	for (const name of names) {
		if (applied.has(name)) {
			continue;
		}
		const sql = await readFile(join(migrationsDir, name), "utf-8");
		const statements = sql
			.split(/-->\s*statement-breakpoint/gu)
			.map((statement) => statement.trim())
			.filter(
				(statement) =>
					(statement &&
						!statement.replaceAll(/\n.*/gsu, "").startsWith("--")) ||
					statement.includes("\n")
			);
		db.exec("BEGIN");
		try {
			for (const statement of statements) {
				const clean = statement.replaceAll(/^\s*--.*$/gmu, "").trim();
				if (clean) {
					db.exec(clean);
				}
			}
			db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw new Error(
				`Migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error }
			);
		}
		ran.push(name);
	}
	return ran;
}
