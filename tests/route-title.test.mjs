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
	join(root, "node_modules", "mailflare-route-title-")
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
		contents: `export { getRouteTitleKey } from "./src/components/route-title-utils.ts";`,
		resolveDir: root,
		sourcefile: "route-title-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { getRouteTitleKey } = await import(
	pathToFileURL(join(directory, "entry.mjs")).href
);

test("pages are titled with the most specific matching route", () => {
	assert.equal(getRouteTitleKey("/settings"), "settings.nav.settings");
	assert.equal(getRouteTitleKey("/settings/security"), "settings.nav.security");
	assert.equal(getRouteTitleKey("/settings/api-keys"), "settings.nav.apiKeys");
	assert.equal(
		getRouteTitleKey("/accounts/abc/permissions"),
		"admin.nav.accounts"
	);
	assert.equal(getRouteTitleKey("/domains"), "admin.nav.domains");
});

test("routes that set their own title are left alone", () => {
	for (const path of [
		"/inbox",
		"/inbox/msg_1",
		"/sent",
		"/folders/f1",
		"/login",
		"/domainsx",
	]) {
		assert.equal(getRouteTitleKey(path), null);
	}
});
