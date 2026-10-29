import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const bundleDirectory = mkdtempSync(
	join(root, "node_modules", "mailflare-unread-bundle-")
);
await build({
	alias: { "cloudflare:workers": "./server/runtime/cloudflare-workers.ts" },
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(bundleDirectory, "entry.mjs"),
	packages: "external",
	platform: "node",
	stdin: {
		contents: `
			export { getUnreadFlipCount } from "./src/components/messages/utils.ts";
			export { PartialDeleteError, throwIfDeleteSkipped } from "./src/lib/messages/permanent-delete-utils.ts";
		`,
		resolveDir: root,
		sourcefile: "unread-test-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { getUnreadFlipCount, PartialDeleteError, throwIfDeleteSkipped } =
	await import(pathToFileURL(join(bundleDirectory, "entry.mjs")).href);
rmSync(bundleDirectory, { force: true, recursive: true });

const single = (read, direction = "inbound") => ({ direction, read });
const grouped = (threadUnread, size) => ({
	direction: "inbound",
	read: threadUnread === 0,
	threadMessageIds: Array.from({ length: size }, (_, index) => `m${index}`),
	threadUnread,
});

test("a single unread inbound message flips once", () => {
	assert.equal(getUnreadFlipCount(single(false), true), 1);
	assert.equal(getUnreadFlipCount(single(true), false), 1);
});

test("a message that already has the requested state flips nothing", () => {
	assert.equal(getUnreadFlipCount(single(true), true), 0);
	assert.equal(getUnreadFlipCount(single(false), false), 0);
});

test("outbound messages never count towards unread", () => {
	assert.equal(getUnreadFlipCount(single(false, "outbound"), true), 0);
	assert.equal(getUnreadFlipCount(single(true, "outbound"), false), 0);
});

test("a conversation row flips every unread message when marked read", () => {
	assert.equal(getUnreadFlipCount(grouped(2, 5), true), 2);
	assert.equal(getUnreadFlipCount(grouped(0, 5), true), 0);
});

test("a conversation row flips every read message when marked unread", () => {
	assert.equal(getUnreadFlipCount(grouped(0, 4), false), 4);
	assert.equal(getUnreadFlipCount(grouped(1, 4), false), 3);
	assert.equal(getUnreadFlipCount(grouped(4, 4), false), 0);
});

test("a skipped permanent delete is reported after the list is told to refresh", async () => {
	const events = [];
	globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
	try {
		await throwIfDeleteSkipped(
			Response.json({ deleted: 1, ok: true, skipped: 2 }),
			"read"
		);
		await throwIfDeleteSkipped(
			Response.json({ deleted: 3, ok: true, skipped: 0 }),
			"delete"
		);
		assert.deepEqual(events, []);
		await assert.rejects(
			throwIfDeleteSkipped(
				Response.json({ deleted: 1, ok: true, skipped: 2 }),
				"delete"
			),
			(error) => error instanceof PartialDeleteError && error.skipped === 2
		);
		assert.deepEqual(events, ["mailflare:messages-changed"]);
	} finally {
		delete globalThis.window;
	}
});
