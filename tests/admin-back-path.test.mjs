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
	join(root, "node_modules", "mailflare-admin-back-")
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
		contents: `export { getAdminBackPath } from "./src/components/admin-page-titles.ts";`,
		resolveDir: root,
		sourcefile: "admin-back-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { getAdminBackPath } = await import(
	pathToFileURL(join(directory, "entry.mjs")).href
);

test("admin detail pages go back to their nearest titled ancestor", () => {
	assert.equal(getAdminBackPath("/accounts/usr_1"), "/accounts");
	assert.equal(getAdminBackPath("/accounts/usr_1/permissions"), "/accounts");
	assert.equal(getAdminBackPath("/mailboxes/mbx_1"), "/mailboxes");
	assert.equal(getAdminBackPath("/ai-usage"), "/agent");
});

test("pages in the admin nav have no back button", () => {
	for (const path of ["/accounts", "/admin", "/agent", "/domains"]) {
		assert.equal(getAdminBackPath(path), null, path);
	}
});
