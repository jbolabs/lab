import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

import { at, createConversationFixture } from "./conversation-page-utils.mjs";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const outDir = mkdtempSync(join(root, "tests", ".tmp-conversation-page-"));
after(() => rmSync(outDir, { force: true, recursive: true }));

await build({
	bundle: true,
	entryPoints: {
		database: join(root, "server/runtime/sqlite-database.ts"),
		page: join(root, "src/app/api/messages/utils.ts"),
	},
	external: ["better-sqlite3", "drizzle-orm", "drizzle-orm/*"],
	format: "esm",
	logLevel: "silent",
	outExtension: { ".js": ".mjs" },
	outdir: outDir,
	platform: "node",
	target: "node22",
	tsconfig: join(root, "tsconfig.json"),
});

const { loadConversationPage } = await import(
	pathToFileURL(join(outDir, "page.mjs")).href
);
const { SqliteDatabase } = await import(
	pathToFileURL(join(outDir, "database.mjs")).href
);

test("deep conversation pages use two queries and report the real total", async (t) => {
	const rows = Array.from({ length: 15_000 }, (_, index) =>
		at(index, `m${String(index).padStart(5, "0")}`)
	);
	const fixture = createConversationFixture(SqliteDatabase, rows);
	t.after(() => fixture.database.db.close());
	const page = await loadConversationPage({
		db: fixture.db,
		limit: 25,
		offset: 12_500,
		where: fixture.where,
	});

	assert.equal(fixture.queryCount(), 2);
	assert.equal(page.total, 15_000);
	assert.equal(page.ids.length, 25);
	assert.equal(page.ids[0], "m02499");
	assert.equal(page.ids.at(-1), "m02475");
});

test("a long conversation does not consume one query per batch of messages", async (t) => {
	const rows = Array.from({ length: 15_000 }, (_, index) =>
		at(index, `m${String(index).padStart(5, "0")}`, "long-thread")
	);
	const fixture = createConversationFixture(SqliteDatabase, rows);
	t.after(() => fixture.database.db.close());
	const page = await loadConversationPage({
		db: fixture.db,
		limit: 25,
		offset: 0,
		where: fixture.where,
	});

	assert.equal(fixture.queryCount(), 2);
	assert.equal(page.total, 1);
	assert.deepEqual(page.ids, ["m14999"]);
});

test("equal timestamps select one head per thread before applying the offset", async (t) => {
	const fixture = createConversationFixture(SqliteDatabase, [
		at(100, "a", "same-thread"),
		at(100, "c", "same-thread"),
		at(100, "b", null),
	]);
	t.after(() => fixture.database.db.close());
	const first = await loadConversationPage({
		db: fixture.db,
		limit: 1,
		offset: 0,
		where: fixture.where,
	});
	const second = await loadConversationPage({
		db: fixture.db,
		limit: 1,
		offset: 1,
		where: fixture.where,
	});

	assert.deepEqual(first, { ids: ["c"], total: 2 });
	assert.deepEqual(second, { ids: ["b"], total: 2 });
});

test("counts and conversation heads share mailbox and status filters", async (t) => {
	const fixture = createConversationFixture(SqliteDatabase, [
		at(100, "visible", "shared-thread"),
		at(200, "other-mailbox", "shared-thread", "theirs"),
		at(300, "archived", "shared-thread", "mine", "archived"),
		at(400, "hidden-thread", "hidden", "theirs"),
	]);
	t.after(() => fixture.database.db.close());
	const page = await loadConversationPage({
		db: fixture.db,
		limit: 25,
		offset: 0,
		where: fixture.where,
	});

	assert.deepEqual(page, { ids: ["visible"], total: 1 });
});

test("an offset past the end returns no heads and retains the real total", async (t) => {
	const fixture = createConversationFixture(SqliteDatabase, [
		at(1, "only-message"),
	]);
	t.after(() => fixture.database.db.close());
	const page = await loadConversationPage({
		db: fixture.db,
		limit: 25,
		offset: 50,
		where: fixture.where,
	});

	assert.equal(fixture.queryCount(), 2);
	assert.deepEqual(page, { ids: [], total: 1 });
});
