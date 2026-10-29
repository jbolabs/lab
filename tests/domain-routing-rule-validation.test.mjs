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
	join(root, "node_modules", "mailflare-routing-rule-test-")
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
		contents: `
			export { domainRoutingRuleSchema } from "./src/lib/validators.ts";
			export { compileRulePattern } from "./src/lib/email/rule-pattern.ts";
			export { emptyRuleInput, ruleToInput } from "./src/components/settings/domain-routing/utils.ts";
		`,
		resolveDir: root,
		sourcefile: "domain-routing-rule-test-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const {
	compileRulePattern,
	domainRoutingRuleSchema,
	emptyRuleInput,
	ruleToInput,
} = await import(pathToFileURL(join(directory, "entry.mjs")).href);

// The rule dialog submits every field of its form state, whatever the action.
function dialogPayload(overrides) {
	return {
		...emptyRuleInput("domain"),
		matchValue: "*",
		name: "Catch-all",
		...overrides,
	};
}

function fieldErrors(input) {
	const parsed = domainRoutingRuleSchema.safeParse(input);
	return parsed.success ? null : parsed.error.flatten().fieldErrors;
}

test("deliver and reject rules accept the blank forwarding address the dialog submits", () => {
	const deliver = dialogPayload({ action: "store", mailboxId: "mailbox" });
	assert.equal(deliver.forwardTo, "");
	assert.equal(fieldErrors(deliver), null);
	assert.equal(domainRoutingRuleSchema.parse(deliver).forwardTo, null);
	assert.equal(
		domainRoutingRuleSchema.parse({ ...deliver, forwardTo: "   " }).forwardTo,
		null
	);
	assert.equal(fieldErrors(dialogPayload({ action: "reject" })), null);
});

test("editing or toggling a stored deliver rule resubmits its forwarding address as blank", () => {
	const input = ruleToInput({
		action: "store",
		domainId: "domain",
		enabled: true,
		forwardTo: null,
		id: "rule",
		keepCopy: false,
		lastMatchedAt: null,
		mailboxId: "mailbox",
		matchCount: 0,
		matchField: "recipient",
		matchOperator: "contains",
		matchValue: "*",
		name: null,
		priority: 0,
		rejectReason: null,
	});
	assert.equal(input.forwardTo, "");
	assert.equal(fieldErrors(input), null);
	assert.equal(fieldErrors({ ...input, enabled: false }), null);
});

test("forward rules still require a valid forwarding address", () => {
	assert.ok(
		fieldErrors(dialogPayload({ action: "forward" }))?.forwardTo?.includes(
			"A forwarding destination is required"
		)
	);
	assert.ok(
		fieldErrors(
			dialogPayload({ action: "forward", forwardTo: "not-an-address" })
		)?.forwardTo
	);
	const forward = dialogPayload({
		action: "forward",
		forwardTo: " team@example.com ",
	});
	assert.equal(fieldErrors(forward), null);
	assert.equal(
		domainRoutingRuleSchema.parse(forward).forwardTo,
		"team@example.com"
	);
});

test("stored rule patterns keep the legacy regex syntax", () => {
	// `\@` is a valid identity escape without the `u` flag; rules saved this way must keep matching.
	const pattern = String.raw`^offers\@example\.com$`;
	assert.equal(
		compileRulePattern(pattern, "i").test("Offers@Example.com"),
		true
	);
	const errors = fieldErrors(
		dialogPayload({ matchOperator: "regex", matchValue: pattern })
	);
	assert.equal(errors?.matchValue, undefined);
});
