import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test from "node:test";

const { existsSync, readdirSync, readFileSync } = fs;
const { join } = nodePath;

const APP = join(import.meta.dirname, "..", "src", "app");

// Shell layouts render their top bar through AppTopBar, which owns the phone safe-area inset;
// a hand-rolled <header> put drive, calendar and settings under the status bar.
test("app shell layouts use AppTopBar instead of a raw header", () => {
	const shells = readdirSync(APP)
		.filter((name) => name.startsWith("("))
		.map((name) => join(APP, name, "layout.tsx"))
		.filter((path) => existsSync(path));
	assert.ok(shells.length > 0);
	const offenders = shells.filter((path) =>
		/<header\b/u.test(readFileSync(path, "utf-8"))
	);
	assert.deepEqual(offenders, []);
});
