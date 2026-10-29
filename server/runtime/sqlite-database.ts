import Database from "better-sqlite3";

import { SqlitePreparedStatement } from "./sqlite-statement";
import type { Row } from "./sqlite-statement";

/**
 * The D1 database API over a local SQLite file. Drizzle's D1 driver and the
 * app's raw `env.DB.prepare(...)` calls both go through this, so the schema,
 * migrations, FTS index and triggers are identical to a Cloudflare deploy.
 */
export class SqliteDatabase {
	readonly db: Database.Database;

	constructor(filename: string) {
		this.db = new Database(filename) as Database.Database & {
			__statements?: Map<string, Database.Statement>;
		};
		(
			this.db as Database.Database & {
				__statements?: Map<string, Database.Statement>;
			}
		).__statements = new Map();
		this.db.pragma("journal_mode = WAL");
		this.db.pragma("foreign_keys = ON");
		this.db.pragma("busy_timeout = 5000");
	}

	prepare(sql: string) {
		return new SqlitePreparedStatement(
			this.db as Database.Database & {
				__statements?: Map<string, Database.Statement>;
			},
			sql
		);
	}

	/** Run statements atomically, like D1's batch. */
	async batch<T = Row>(statements: SqlitePreparedStatement[]) {
		const results: Awaited<ReturnType<SqlitePreparedStatement["all"]>>[] = [];
		this.db.exec("BEGIN");
		try {
			for (const statement of statements) {
				results.push(await statement.all<T>());
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
		return results;
	}

	exec(sql: string) {
		try {
			this.db.exec(sql);
			return Promise.resolve({ count: 0, duration: 0 });
		} catch (error) {
			return Promise.reject(error);
		}
	}

	dump(): Promise<ArrayBuffer> {
		try {
			const buffer = this.db.serialize();
			return Promise.resolve(
				buffer.buffer.slice(
					buffer.byteOffset,
					buffer.byteOffset + buffer.byteLength
				) as ArrayBuffer
			);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	withSession() {
		return this;
	}
}

export function openSqliteDatabase(filename: string): D1Database {
	return new SqliteDatabase(filename) as unknown as D1Database;
}
