import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, readdirSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const migrationsDirectory = join(root, "drizzle/migrations");
const bundleDirectory = mkdtempSync(
	join(root, "node_modules", "mailflare-bootstrap-bundle-")
);
after(() => rmSync(bundleDirectory, { force: true, recursive: true }));

await build({
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(bundleDirectory, "entry.mjs"),
	packages: "external",
	platform: "node",
	stdin: {
		contents: `
			export { SqliteDatabase } from "./server/runtime/sqlite-database.ts";
			export { applyMigrations } from "./server/runtime/migrate.ts";
		`,
		resolveDir: root,
		sourcefile: "bootstrap-schema-test-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { SqliteDatabase, applyMigrations } = await import(
	pathToFileURL(join(bundleDirectory, "entry.mjs")).href
);

const columns = (database, table) =>
	database.db
		.prepare(`PRAGMA table_info(${table})`)
		.all()
		.map((column) => column.name);

test("a fresh database records every migration, so later deploys do not re-apply them", async (t) => {
	const database = new SqliteDatabase(":memory:");
	t.after(() => database.db.close());
	const files = readdirSync(migrationsDirectory).filter((name) =>
		name.endsWith(".sql")
	);
	const applied = await applyMigrations(database, migrationsDirectory);
	assert.deepEqual([...applied].toSorted(), [...files].toSorted());
	const recorded = database.db
		.prepare("SELECT name FROM d1_migrations")
		.all()
		.map((row) => row.name);
	assert.deepEqual(recorded.toSorted(), [...files].toSorted());
	assert.deepEqual(await applyMigrations(database, migrationsDirectory), []);
});

test("fresh schema accepts the current Drizzle mailbox and license inserts", async (t) => {
	const database = new SqliteDatabase(":memory:");
	t.after(() => database.db.close());
	await applyMigrations(database, migrationsDirectory);
	const { db } = database;

	assert.ok(
		[
			"signature",
			"auto_reply_enabled",
			"auto_reply_subject",
			"auto_reply_body",
		].every((name) => columns(database, "mailboxes").includes(name))
	);
	assert.ok(columns(database, "domains").includes("sending_requested"));
	for (const table of [
		"license_settings",
		"auto_reply_deliveries",
		"spam_token_stats",
		"spam_reputation",
		"spam_feedback",
	]) {
		assert.ok(
			db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
				)
				.get(table),
			`${table} is missing`
		);
	}

	db.prepare(
		"INSERT INTO users (id, email, password_hash, name, created_at) VALUES ('u', 'a@b.c', 'x', 'n', 1)"
	).run();
	db.prepare(
		"INSERT INTO domains (id, user_id, hostname, zone_id, created_at) VALUES ('d', 'u', 'ex.com', 'z', 1)"
	).run();
	db.prepare(`
		INSERT INTO mailboxes (id, user_id, domain_id, local_part, display_name, signature, auto_reply_enabled, auto_reply_subject, auto_reply_body, created_at)
		VALUES ('m', 'u', 'd', 'admin', 'admin', 'sig', 0, 'Out of office', '', 1)
	`).run();
	db.prepare(
		"INSERT INTO license_settings (id, instance_id, updated_at) VALUES ('default', 'inst', 1)"
	).run();
	assert.equal(
		db.prepare("SELECT count(*) AS count FROM mailboxes").get().count,
		1
	);
});
