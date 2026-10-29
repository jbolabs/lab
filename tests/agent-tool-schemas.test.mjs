import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { zodSchema } from "ai";
import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const bundleDirectory = mkdtempSync(
	join(root, "node_modules", "mailflare-schema-bundle-")
);
await build({
	alias: {
		"cloudflare:workers": "./server/runtime/cloudflare-workers.ts",
	},
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(bundleDirectory, "entry.mjs"),
	packages: "external",
	platform: "node",
	stdin: {
		contents: `
			export { emailToolSchemas } from "./src/lib/agent/tools.ts";
			export { calendarToolSchemas } from "./src/lib/calendar/tools.ts";
		`,
		resolveDir: root,
		sourcefile: "agent-schema-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { emailToolSchemas, calendarToolSchemas } = await import(
	pathToFileURL(join(bundleDirectory, "entry.mjs")).href
);
after(() => rmSync(bundleDirectory, { force: true, recursive: true }));

// streamText sends zodSchema().jsonSchema (draft-07). MCP registerTool sends ~standard.jsonSchema.input (draft-2020-12).
const LOOKAROUND = /\(\?(?:[=!]|<[=!])/u;

function providerSchemas(schema) {
	return [
		zodSchema(schema).jsonSchema,
		schema["~standard"].jsonSchema.input({ target: "draft-2020-12" }),
	];
}

function patterns(schema, found = []) {
	if (!schema || typeof schema !== "object") {
		return found;
	}
	if (typeof schema.pattern === "string") {
		found.push(schema.pattern);
	}
	for (const value of Object.values(schema)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				patterns(item, found);
			}
		} else {
			patterns(value, found);
		}
	}
	return found;
}

const toolSchemas = { ...emailToolSchemas, ...calendarToolSchemas };

test("list_emails exposes an optional nullable cursor with pagination instructions", () => {
	assert.equal(
		emailToolSchemas.list_emails.safeParse({ folder: "inbox", limit: 1 })
			.success,
		true
	);
	assert.equal(
		emailToolSchemas.list_emails.safeParse({
			cursor: null,
			folder: "inbox",
			limit: 1,
		}).success,
		true
	);
	assert.equal(
		emailToolSchemas.list_emails.safeParse({
			cursor: "",
			folder: "inbox",
			limit: 1,
		}).success,
		false
	);
	for (const json of providerSchemas(emailToolSchemas.list_emails)) {
		assert.equal(json.required?.includes("cursor") ?? false, false);
		assert.match(json.properties.cursor.description, /first page/u);
		assert.match(json.properties.cursor.description, /nextCursor/u);
		assert.ok(
			json.properties.cursor.anyOf.some((option) => option.type === "null")
		);
	}
});

test("model-facing email and calendar tool schemas contain no regex lookaround", () => {
	const offenders = [];
	for (const [name, schema] of Object.entries(toolSchemas)) {
		for (const json of providerSchemas(schema)) {
			for (const pattern of patterns(json)) {
				if (LOOKAROUND.test(pattern)) {
					offenders.push(`${name}: ${pattern}`);
				}
			}
		}
	}
	assert.deepEqual(offenders, []);
});

test("draft and calendar execution still validate email addresses", () => {
	const draft = { body: "Hello", subject: "Hi" };
	assert.equal(
		emailToolSchemas.draft_email.safeParse({ ...draft, to: "not-an-email" })
			.success,
		false
	);
	assert.equal(
		emailToolSchemas.draft_email.safeParse({ ...draft, to: "a..b@example.com" })
			.success,
		false
	);
	assert.equal(
		emailToolSchemas.draft_email.safeParse({
			...draft,
			to: "owner@example.com",
		}).success,
		true
	);

	const event = {
		endsAt: "2026-10-12T16:00:00.000Z",
		startsAt: "2026-10-12T15:00:00.000Z",
		title: "Meet",
	};
	assert.equal(
		calendarToolSchemas.create_event.safeParse({
			...event,
			attendees: ["not-an-email"],
		}).success,
		false
	);
	assert.equal(
		calendarToolSchemas.create_event.safeParse({
			...event,
			attendees: ["a..b@example.com"],
		}).success,
		false
	);
	assert.equal(
		calendarToolSchemas.create_event.safeParse({
			...event,
			attendees: ["owner@example.com"],
		}).success,
		true
	);
	assert.equal(
		calendarToolSchemas.update_events.safeParse({
			updates: [{ attendees: ["not-an-email"], eventId: "evt-1" }],
		}).success,
		false
	);
	assert.equal(
		calendarToolSchemas.update_events.safeParse({
			updates: [{ attendees: ["owner@example.com"], eventId: "evt-1" }],
		}).success,
		true
	);
});
