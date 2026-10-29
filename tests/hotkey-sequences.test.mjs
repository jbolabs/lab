import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const directory = mkdtempSync(join(root, "node_modules", "mailflare-hotkeys-"));
after(() => rmSync(directory, { force: true, recursive: true }));
await build({
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(directory, "entry.mjs"),
	packages: "external",
	platform: "node",
	stdin: {
		contents: `export { findSequenceMatch, hasCommandModifier, isModifierKey } from "./src/components/shortcuts/use-hotkeys-utils.ts";`,
		resolveDir: root,
		sourcefile: "hotkey-sequences-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { findSequenceMatch, hasCommandModifier, isModifierKey } = await import(
	pathToFileURL(join(directory, "entry.mjs")).href
);

const shortcuts = [{ key: "g i" }, { key: "g !" }, { key: "e" }];

test("a sequence matches when it ends the buffer", () => {
	assert.equal(findSequenceMatch(["g", "i"], shortcuts), shortcuts[0]);
	assert.equal(findSequenceMatch(["j", "g", "i"], shortcuts), shortcuts[0]);
	assert.equal(findSequenceMatch(["g", "!"], shortcuts), shortcuts[1]);
});

test("a lone key only matches when it is the whole buffer", () => {
	assert.equal(findSequenceMatch(["e"], shortcuts), shortcuts[2]);
	assert.equal(findSequenceMatch(["j", "e"], shortcuts), undefined);
	assert.equal(findSequenceMatch([], shortcuts), undefined);
});

test("modifier keys are not part of a sequence", () => {
	for (const key of ["shift", "control", "alt", "meta"]) {
		assert.equal(isModifierKey(key), true);
	}
	assert.equal(isModifierKey("g"), false);
});

test("a bare key is only handled when no command modifier is held", () => {
	assert.equal(
		hasCommandModifier({ altKey: false, ctrlKey: false, metaKey: true }),
		true
	);
	assert.equal(
		hasCommandModifier({ altKey: false, ctrlKey: true, metaKey: false }),
		true
	);
	assert.equal(
		hasCommandModifier({ altKey: true, ctrlKey: false, metaKey: false }),
		true
	);
	assert.equal(
		hasCommandModifier({ altKey: false, ctrlKey: false, metaKey: false }),
		false
	);
});
