import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// mix-blend-mode on list avatars left inbox rows unpainted in Chromium until hovered.
// shadcn's avatar ships with it, so re-adding the component brings it back.
test("no mix-blend-mode in the app", () => {
	const offenders = readdirSync("src", { recursive: true })
		.filter((file) => /\.(?:tsx?|css)$/u.test(file))
		.filter((file) =>
			/mix-blend-(?!normal)|mix-blend-mode:\s*(?!normal)/u.test(
				readFileSync(path.join("src", file), "utf-8")
			)
		);
	assert.deepEqual(offenders, []);
});
