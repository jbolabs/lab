import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { tmpdir } = os;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");

/**
 * The modules under test import through the `@/*` alias and are TypeScript, so
 * they are bundled with the esbuild already used by `scripts/build-server.mjs`
 * rather than loaded directly. Nothing here touches a Workers binding: the
 * import helpers are pure and the query layer only builds SQL.
 */
const outDir = mkdtempSync(join(tmpdir(), "mailflare-jmap-test-"));
after(() => rmSync(outDir, { force: true, recursive: true }));

await build({
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(outDir, "entry.mjs"),
	platform: "node",
	stdin: {
		contents: `
			export { idSetToList, importFlags, parseReceivedAt, resolveDraftsMailbox } from "./src/lib/jmap/email-import-utils.ts";
			export { filterToSql } from "./src/lib/jmap/email-query.ts";
			export { encodeMailboxRef } from "./src/lib/jmap/ids.ts";
			import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
			const dialect = new SQLiteSyncDialect();
			export const render = (fragment) => dialect.sqlToQuery(fragment);
		`,
		resolveDir: root,
		sourcefile: "jmap-test-entry.js",
	},
	target: "node22",
	tsconfig: join(root, "tsconfig.json"),
});

const {
	idSetToList,
	importFlags,
	parseReceivedAt,
	resolveDraftsMailbox,
	filterToSql,
	encodeMailboxRef,
	render,
} = await import(pathToFileURL(join(outDir, "entry.mjs")).href);

const DRAFTS = encodeMailboxRef({
	kind: "role",
	mailboxId: "mbx1",
	role: "drafts",
});
const INBOX = encodeMailboxRef({
	kind: "role",
	mailboxId: "mbx1",
	role: "inbox",
});
const FOLDER = encodeMailboxRef({
	folderId: "fld1",
	kind: "folder",
	mailboxId: "mbx1",
});
const writable = new Set(["mbx1"]);

const renderFilter = (filter) => render(filterToSql(filter, writable));

test("JMAP Id[Boolean] sets are read as maps and as plain lists", () => {
	assert.deepEqual(idSetToList({ a: true, b: true }), ["a", "b"]);
	assert.deepEqual(idSetToList({ a: true, b: false }), ["a"]);
	assert.deepEqual(idSetToList(["a", "b"]), ["a", "b"]);
	assert.deepEqual(idSetToList(undefined), []);
	assert.deepEqual(idSetToList("nonsense"), []);
	assert.deepEqual(idSetToList([1, "a"]), ["a"]);
});

test("only the keywords Mailflare stores as columns are mapped", () => {
	assert.deepEqual(importFlags({ $draft: true, $seen: true }), {
		read: true,
		starred: false,
	});
	assert.deepEqual(importFlags({ $flagged: true }), {
		read: false,
		starred: true,
	});
	assert.deepEqual(importFlags(["$draft", "$seen", "$flagged"]), {
		read: true,
		starred: true,
	});
	// $draft is implied by the Drafts-only rule and unknown keywords are ignored.
	assert.deepEqual(
		importFlags({ $answered: true, $draft: true, "custom-tag": true }),
		{ read: false, starred: false }
	);
	assert.deepEqual(importFlags(undefined), { read: false, starred: false });
});

test("receivedAt accepts a UTCDate, epoch seconds and epoch milliseconds", () => {
	assert.equal(
		parseReceivedAt("2026-09-16T09:00:00Z").toISOString(),
		"2026-09-16T09:00:00.000Z"
	);
	assert.equal(
		parseReceivedAt(1_789_549_200).toISOString(),
		"2026-09-16T09:00:00.000Z"
	);
	assert.equal(
		parseReceivedAt(1_789_549_200_000).toISOString(),
		"2026-09-16T09:00:00.000Z"
	);
	assert.equal(parseReceivedAt("not a date"), null);
	assert.equal(parseReceivedAt(""), null);
	assert.equal(parseReceivedAt(undefined), null);
	assert.equal(parseReceivedAt(Number.NaN), null);
});

test("an import targets exactly one writable Drafts mailbox", () => {
	assert.deepEqual(resolveDraftsMailbox({ [DRAFTS]: true }, writable), {
		mailboxId: "mbx1",
	});
	assert.deepEqual(resolveDraftsMailbox([DRAFTS], writable), {
		mailboxId: "mbx1",
	});
});

test("anything but a Drafts mailbox is rejected as invalidProperties on mailboxIds", () => {
	for (const [name, mailboxIds] of [
		["no mailbox", {}],
		["two mailboxes", { [DRAFTS]: true, [INBOX]: true }],
		["the inbox", { [INBOX]: true }],
		["a user folder", { [FOLDER]: true }],
		["the account mailbox", { mbx1: true }],
		["an unknown mailbox", { "mbx9~drafts": true }],
		["a read-only mailbox", { "mbx2~drafts": true }],
		["a malformed id", { "~~": true }],
	]) {
		const result = resolveDraftsMailbox(mailboxIds, writable);
		assert.ok("error" in result, `${name} should be rejected`);
		assert.equal(result.error.type, "invalidProperties", name);
		assert.deepEqual(result.error.properties, ["mailboxIds"], name);
	}
});

test("a Message-ID header filter compares without angle brackets", () => {
	const withBrackets = renderFilter({
		header: ["Message-ID", "<abc@example.com>"],
	});
	const without = renderFilter({ header: ["Message-ID", "abc@example.com"] });
	const padded = renderFilter({
		header: ["Message-ID", "  <abc@example.com>  "],
	});
	assert.deepEqual(withBrackets.params, [
		"abc@example.com",
		"<abc@example.com>",
	]);
	assert.deepEqual(without.params, withBrackets.params);
	assert.deepEqual(padded.params, withBrackets.params);
	assert.match(withBrackets.sql, /provider_message_id/u);
});

test("the header name is matched case-insensitively", () => {
	const upper = renderFilter({ header: ["MESSAGE-ID", "<abc@example.com>"] });
	const lower = renderFilter({ header: ["message-id", "<abc@example.com>"] });
	assert.equal(upper.sql, lower.sql);
	assert.deepEqual(upper.params, lower.params);
});

test("In-Reply-To and References map onto their own columns", () => {
	const inReplyTo = renderFilter({
		header: ["In-Reply-To", "<parent@example.com>"],
	});
	assert.match(inReplyTo.sql, /in_reply_to/u);
	assert.deepEqual(inReplyTo.params, [
		"parent@example.com",
		"<parent@example.com>",
	]);

	// The column is the space-joined chain, so the pattern is padded and matches whole ids only.
	const references = renderFilter({
		header: ["References", "<root@example.com>"],
	});
	assert.match(references.sql, /references_header/u);
	assert.deepEqual(references.params, ["% root@example.com %"]);
});

test("the one-element form asks whether the header is present at all", () => {
	assert.match(
		renderFilter({ header: ["Message-ID"] }).sql,
		/provider_message_id" is not null/u
	);
	assert.match(
		renderFilter({ header: ["In-Reply-To"] }).sql,
		/in_reply_to" is not null/u
	);
	assert.match(
		renderFilter({ header: ["References"] }).sql,
		/references_header" is not null/u
	);
	assert.deepEqual(renderFilter({ header: ["Message-ID"] }).params, []);
});

test("a header Mailflare cannot answer is an unsupportedFilter error, not a match-all (RFC 8620 §5.5)", () => {
	for (const header of [
		["X-Unknown"],
		["X-Mailer", "Flectar"],
		["Reply-To", "someone@example.com"],
	]) {
		assert.throws(
			() => filterToSql({ header }, writable),
			(error) => error.type === "unsupportedFilter",
			JSON.stringify(header)
		);
	}
	// Nested in an operator tree it must still surface rather than drop the condition.
	assert.throws(
		() =>
			filterToSql(
				{
					conditions: [{ inMailbox: DRAFTS }, { header: ["X-Unknown"] }],
					operator: "AND",
				},
				writable
			),
		(error) => error.type === "unsupportedFilter"
	);
});

test("a malformed header condition is invalidArguments", () => {
	for (const header of [[], ["Message-ID", "a", "b"], [42]]) {
		assert.throws(
			() => filterToSql({ header }, writable),
			(error) => error.type === "invalidArguments",
			JSON.stringify(header)
		);
	}
});

test("the de-duplication query a client sends narrows the mailbox instead of matching every draft", () => {
	// Flectar's query_draft_by_message_id: { inMailbox: drafts, header: ["Message-ID", id] }.
	const query = renderFilter({
		header: ["Message-ID", "<draft@example.com>"],
		inMailbox: DRAFTS,
	});
	assert.match(query.sql, /mailbox_id/u);
	assert.match(query.sql, /provider_message_id/u);
	assert.ok(query.params.includes("draft@example.com"), query.params);
	assert.ok(query.params.includes("mbx1"), query.params);

	// Without the Message-ID the same query is only the mailbox predicate, which is
	// what every draft used to match.
	const unfiltered = renderFilter({ inMailbox: DRAFTS });
	assert.doesNotMatch(unfiltered.sql, /provider_message_id/u);
	assert.ok(query.sql.length > unfiltered.sql.length);
});
