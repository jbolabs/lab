import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, readFileSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const directory = mkdtempSync(
	join(root, "node_modules", "mailflare-tailwind-merge-theme-")
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
		contents: `export { cn } from "./src/lib/utils.ts";`,
		resolveDir: root,
		sourcefile: "tailwind-merge-theme-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { cn } = await import(pathToFileURL(join(directory, "entry.mjs")).href);

const css = readFileSync(join(root, "src", "app", "globals.css"), "utf-8");
const easings = [...css.matchAll(/^\s*--ease-(?<name>[\w-]+):/gmu)].map(
	(match) => match.groups.name
);

test("every custom easing in the theme overrides the default one in cn()", () => {
	assert.ok(easings.length > 0);
	for (const name of easings) {
		assert.equal(cn("ease-in-out", `ease-${name}`), `ease-${name}`, name);
	}
});
