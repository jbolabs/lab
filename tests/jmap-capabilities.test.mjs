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

/**
 * The module under test imports through the `@/*` alias and is TypeScript, so it is bundled with the
 * esbuild already used by `scripts/build-server.mjs` rather than loaded directly. Nothing here
 * touches a Workers binding: `validateRequest` only inspects the decoded request object.
 */
const outDir = mkdtempSync(join(tmpdir(), "mailflare-jmap-capabilities-test-"));
after(() => rmSync(outDir, { force: true, recursive: true }));

await build({
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(outDir, "entry.mjs"),
	platform: "node",
	stdin: {
		contents: `export { SUPPORTED_CAPABILITIES, validateRequest } from "./src/lib/jmap/processor.ts";`,
		resolveDir: root,
		sourcefile: "jmap-capabilities-test-entry.js",
	},
	target: "node22",
	tsconfig: join(root, "tsconfig.json"),
});

const { SUPPORTED_CAPABILITIES, validateRequest } = await import(
	pathToFileURL(join(outDir, "entry.mjs")).href
);

const request = (using) => ({
	methodCalls: [["Core/echo", { echo: true }, "c0"]],
	using,
});

test("accepts the capabilities the server advertises", () => {
	for (const capability of SUPPORTED_CAPABILITIES) {
		assert.deepEqual(validateRequest(request([capability])).using, [
			capability,
		]);
	}
});

test("ignores an unimplemented IETF extension capability", () => {
	const using = [
		...SUPPORTED_CAPABILITIES,
		"urn:ietf:params:jmap:vacationresponse",
	];
	assert.deepEqual(validateRequest(request(using)).using, using);
});

test("ignores an unimplemented IETF extension alongside capabilities we do not implement calls for", () => {
	const request_ = {
		methodCalls: [
			["VacationResponse/get", {}, "c0"],
			["Core/echo", { echo: true }, "c1"],
		],
		using: [
			"urn:ietf:params:jmap:core",
			"urn:ietf:params:jmap:vacationresponse",
		],
	};
	assert.equal(validateRequest(request_).methodCalls.length, 2);
});

test("still rejects an unknown capability from another namespace", () => {
	assert.throws(
		() =>
			validateRequest(
				request([...SUPPORTED_CAPABILITIES, "https://example.com/apis/foobar"])
			),
		(error) => {
			assert.equal(error.type, "unknownCapability");
			assert.equal(error.message, "https://example.com/apis/foobar");
			return true;
		}
	);
});

test("still rejects a request that is not a request object", () => {
	assert.throws(
		() => validateRequest({ using: ["urn:ietf:params:jmap:core"] }),
		{ type: "notRequest" }
	);
	assert.throws(() => validateRequest(null), { type: "notRequest" });
});
