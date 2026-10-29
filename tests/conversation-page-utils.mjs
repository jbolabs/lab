import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export function at(
	seconds,
	id,
	threadId = id,
	mailboxId = "mine",
	status = "received"
) {
	return { createdAt: seconds, id, mailboxId, status, threadId };
}

export function createConversationFixture(SqliteDatabase, rows) {
	const database = new SqliteDatabase(":memory:");
	database.db.exec(
		"CREATE TABLE messages (id TEXT PRIMARY KEY, thread_id TEXT, created_at INTEGER NOT NULL, mailbox_id TEXT, status TEXT)"
	);
	const insert = database.db.prepare(
		"INSERT INTO messages (id, thread_id, created_at, mailbox_id, status) VALUES (?, ?, ?, ?, ?)"
	);
	database.db.transaction(() => {
		for (const row of rows) {
			insert.run(
				row.id,
				row.threadId,
				row.createdAt,
				row.mailboxId,
				row.status
			);
		}
	})();

	let queries = 0;
	const prepare = database.prepare.bind(database);
	database.prepare = (query) => {
		queries += 1;
		return prepare(query);
	};

	return {
		database,
		db: drizzle(database),
		queryCount: () => queries,
		where: sql`mailbox_id = ${"mine"} and status = ${"received"}`,
	};
}
