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
	join(root, "node_modules", "mailflare-navigation-transition-")
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
		contents: `export { getNavigationTransitionType } from "./src/lib/navigation-transition-utils.ts";`,
		resolveDir: root,
		sourcefile: "navigation-transition-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { getNavigationTransitionType } = await import(
	pathToFileURL(join(directory, "entry.mjs")).href
);

test("opening something a list contains pushes, going back up pops", () => {
	assert.equal(getNavigationTransitionType("/inbox", "/inbox/msg_1"), "push");
	assert.equal(getNavigationTransitionType("/inbox/msg_1", "/inbox"), "pop");
	assert.equal(
		getNavigationTransitionType("/settings/", "/settings/account"),
		"push"
	);
	assert.equal(
		getNavigationTransitionType("/folders/f1/msg_1", "/folders/f1"),
		"pop"
	);
});

test("sideways moves and first loads do not transition", () => {
	assert.equal(getNavigationTransitionType(undefined, "/inbox"), null);
	assert.equal(
		getNavigationTransitionType("/inbox/msg_1", "/inbox/msg_2"),
		null
	);
	assert.equal(getNavigationTransitionType("/inbox", "/starred"), null);
	assert.equal(getNavigationTransitionType("/inbox", "/inbox"), null);
	assert.equal(getNavigationTransitionType("/inbox", "/inboxes"), null);
});
