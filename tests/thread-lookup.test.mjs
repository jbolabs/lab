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
const outDir = mkdtempSync(join(tmpdir(), "mailflare-thread-lookup-test-"));
after(() => rmSync(outDir, { force: true, recursive: true }));

await build({
	bundle: true,
	entryPoints: [join(root, "src/lib/email/thread-lookup.ts")],
	format: "esm",
	logLevel: "silent",
	outfile: join(outDir, "entry.mjs"),
	platform: "node",
	target: "node22",
});

const { selectThreadLookupIds } = await import(
	pathToFileURL(join(outDir, "entry.mjs")).href
);

test("144 References stay within D1's bound parameter limit while preserving parent, root, and recent ancestors", () => {
	const references = Array.from(
		{ length: 144 },
		(_, index) => `ref-${index}@example.com`
	);
	const selected = selectThreadLookupIds("<parent@example.com>", references);

	assert.equal(selected.length, 40);
	assert.equal(1 + selected.length * 2, 81);
	assert.equal(selected[0], "parent@example.com");
	assert.equal(selected[1], references[0]);
	assert.deepEqual(selected.slice(2), references.slice(-38).toReversed());
});

test("an In-Reply-To also present in References is only looked up once", () => {
	const references = Array.from(
		{ length: 144 },
		(_, index) => `ref-${index}@example.com`
	);
	const selected = selectThreadLookupIds(`<${references.at(-1)}>`, references);

	assert.equal(selected.length, 40);
	assert.equal(new Set(selected).size, selected.length);
	assert.equal(selected[0], references.at(-1));
	assert.equal(selected[1], references[0]);
});
