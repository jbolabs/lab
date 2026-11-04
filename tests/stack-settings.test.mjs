import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { plainSettings, secretSettings } from "../stacks/settings.ts";

const workflow = readFileSync(
	new URL("../.github/workflows/lab.yml", import.meta.url),
	"utf-8"
);
const settings = [...secretSettings, ...plainSettings].toSorted();

test("prod deploys with every optional setting the stack reads, and no others", () => {
	const production = workflow.slice(
		workflow.indexOf("\n  production:"),
		workflow.indexOf("\n  preview:")
	);
	const passed = [
		...production.matchAll(
			/^ {6}(?<name>[A-Z0-9_]+): \$\{\{ secrets\.\k<name> \}\}$/gmu
		),
	]
		.map((match) => match.groups.name)
		.filter((name) => name !== "CLOUDFLARE_API_TOKEN")
		.toSorted();
	assert.deepEqual(passed, settings);
});

test(".env.example documents every optional setting", () => {
	const example = readFileSync(
		new URL("../.env.example", import.meta.url),
		"utf-8"
	);
	for (const name of settings) {
		assert.match(example, new RegExp(`^# ${name}=`, "mu"), name);
	}
});
