import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test from "node:test";

import { GROUPS, UNSCANNED } from "../scripts/ui-scan/pages.mjs";

const { readdirSync } = fs;
const { join } = nodePath;

const ROUTES = join(import.meta.dirname, "..", "src", "routes");
const FOLDER_READER =
	/^\/(?:archived|drafts|scheduled|sent|snoozed|spam|starred|trash|folders\/\$folderId)\/\$messageId$/u;

// `_dashboard.inbox.$messageId.index.tsx` → `/inbox/$messageId`; pathless `_layout` segments drop.
function routePath(file) {
	const segments = file
		.replace(/\.tsx$/u, "")
		.split(".")
		.filter((segment) => segment !== "index" && !segment.startsWith("_"));
	return `/${segments.join("/")}`;
}

test("the UI scan covers every page route or says why not", () => {
	const scanned = new Set(
		Object.values(GROUPS).flatMap((group) =>
			group.pages.map((page) => page.route ?? page.path)
		)
	);
	const pages = readdirSync(ROUTES)
		.filter((file) => file === "index.tsx" || file.endsWith(".index.tsx"))
		.map(routePath);
	const missing = pages.filter(
		(path) =>
			!scanned.has(path) &&
			!(path in UNSCANNED) &&
			!(FOLDER_READER.test(path) && "/$folder/$messageId" in UNSCANNED)
	);
	assert.deepEqual(
		missing,
		[],
		"add these routes to scripts/ui-scan/pages.mjs, or to UNSCANNED with a reason"
	);
});
