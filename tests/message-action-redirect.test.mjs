import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const directory = mkdtempSync(
	join(root, "node_modules", "mailflare-message-actions-")
);
after(() => rmSync(directory, { force: true, recursive: true }));
await build({
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(directory, "entry.mjs"),
	packages: "external",
	platform: "node",
	stdin: {
		contents: `export { getMessageActionRedirect } from "./src/components/message-actions/utils.ts";`,
		resolveDir: root,
		sourcefile: "message-action-redirect-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { getMessageActionRedirect } = await import(
	pathToFileURL(join(directory, "entry.mjs")).href
);

test("moving a message sends the reader back to the list they opened it from", () => {
	for (const action of ["trash", "spam", "archive", "inbox"]) {
		assert.equal(getMessageActionRedirect(action, "/inbox"), "/inbox");
		assert.equal(getMessageActionRedirect(action, "/spam"), "/spam");
	}
});

test("actions that leave the message in place do not navigate", () => {
	for (const action of ["read", "unread", "delete"]) {
		assert.equal(getMessageActionRedirect(action, "/inbox"), null);
	}
});
