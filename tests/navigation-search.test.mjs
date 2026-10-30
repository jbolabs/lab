import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const directory = mkdtempSync(path.join(tmpdir(), "lab-search-test-"));
after(() => rmSync(directory, { force: true, recursive: true }));
const outfile = path.join(directory, "search.mjs");
await build({
	bundle: true,
	entryPoints: [
		path.join(import.meta.dirname, "../src/lib/navigation-search.ts"),
	],
	format: "esm",
	logLevel: "silent",
	outfile,
	platform: "node",
});
const { parseSearch, stringifySearch } = await import(
	pathToFileURL(outfile).href
);
test("query strings preserve add-account flags, numeric IDs, booleans and OAuth return URLs", () => {
	const search = {
		absent: undefined,
		add: "1",
		enabled: "true",
		id: "00123",
		returnTo: "/oauth/authorize?client_id=abc&scope=mcp:read",
	};
	const encoded = stringifySearch(search);
	assert.equal(parseSearch(encoded).add, "1");
	assert.deepEqual(parseSearch(encoded), {
		add: "1",
		enabled: "true",
		id: "00123",
		returnTo: search.returnTo,
	});
	assert.equal(stringifySearch({}), "");
	assert.equal(stringifySearch(parseSearch("?add=1")), "?add=1");
});
