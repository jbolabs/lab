import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { streamText } from "ai";
import { build } from "esbuild";
import { z } from "zod";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const bundleDirectory = mkdtempSync(
	join(root, "node_modules", "mailflare-workers-ai-stream-bundle-")
);
after(() => rmSync(bundleDirectory, { force: true, recursive: true }));

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
			export { getAgentModel } from "./src/lib/agent/model.ts";
		`,
		resolveDir: root,
		sourcefile: "workers-ai-stream-test-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});

const { getAgentModel } = await import(
	pathToFileURL(join(bundleDirectory, "entry.mjs")).href
);

function createMockDb() {
	return {
		prepare() {
			return {
				all: () => Promise.resolve({ results: [] }),
				bind() {
					return {
						all: () => Promise.resolve({ results: [] }),
						raw: () => Promise.resolve([]),
					};
				},
				raw: () => Promise.resolve([]),
			};
		},
	};
}

function createSseStream(events) {
	return new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			for (const event of events) {
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
				);
			}
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			controller.close();
		},
	});
}

test("Workers AI dual-format SSE stream produces deduplicated text", async () => {
	const binding = {
		run: () =>
			Promise.resolve(
				createSseStream([
					{ choices: [{ delta: { content: "OK" }, index: 0 }], response: "OK" },
					{
						choices: [
							{ delta: { content: "." }, finish_reason: "stop", index: 0 },
						],
						response: ".",
					},
				])
			),
	};
	const agent = await getAgentModel({ AI: binding, DB: createMockDb() });
	assert.ok(agent?.model);
	const result = streamText({ model: agent.model, prompt: "say OK" });
	assert.equal(await result.text, "OK.");
});

test("Workers AI native-only stream emits text once", async () => {
	const binding = {
		run: () =>
			Promise.resolve(
				createSseStream([
					{ response: "OK" },
					{ finish_reason: "stop", response: "." },
				])
			),
	};
	const agent = await getAgentModel({ AI: binding, DB: createMockDb() });
	assert.ok(agent?.model);
	const result = streamText({ model: agent.model, prompt: "say OK" });
	assert.equal(await result.text, "OK.");
});

test("Workers AI OpenAI-only stream emits text once", async () => {
	const binding = {
		run: () =>
			Promise.resolve(
				createSseStream([
					{ choices: [{ delta: { content: "OK" }, index: 0 }] },
					{
						choices: [
							{ delta: { content: "." }, finish_reason: "stop", index: 0 },
						],
					},
				])
			),
	};
	const agent = await getAgentModel({ AI: binding, DB: createMockDb() });
	assert.ok(agent?.model);
	const result = streamText({ model: agent.model, prompt: "say OK" });
	assert.equal(await result.text, "OK.");
});

test("Workers AI stream preserves legitimately repeated prose across events", async () => {
	const binding = {
		run: () =>
			Promise.resolve(
				createSseStream([
					{ choices: [{ delta: { content: "ha" }, index: 0 }], response: "ha" },
					{
						choices: [
							{ delta: { content: "ha" }, finish_reason: "stop", index: 0 },
						],
						response: "ha",
					},
				])
			),
	};
	const agent = await getAgentModel({ AI: binding, DB: createMockDb() });
	assert.ok(agent?.model);
	const result = streamText({ model: agent.model, prompt: "laugh" });
	assert.equal(await result.text, "haha");
});

test("Workers AI dual-format stream emits exactly one tool call with parsed arguments", async () => {
	const toolCall = [
		{
			function: {
				arguments: JSON.stringify({ city: "Hanoi" }),
				name: "lookup",
			},
			id: "call_lookup",
			index: 0,
			type: "function",
		},
	];
	const binding = {
		run: () =>
			Promise.resolve(
				createSseStream([
					{
						choices: [{ delta: { tool_calls: toolCall }, index: 0 }],
						tool_calls: toolCall,
					},
				])
			),
	};
	const agent = await getAgentModel({ AI: binding, DB: createMockDb() });
	assert.ok(agent?.model);
	const result = streamText({
		model: agent.model,
		prompt: "lookup Hanoi",
		tools: {
			lookup: {
				description: "lookup info",
				execute: (args) => Promise.resolve(args),
				parameters: z.object({ city: z.string() }),
			},
		},
	});
	const calls = await result.toolCalls;
	assert.equal(calls.length, 1);
	assert.equal(calls[0].toolName, "lookup");
	assert.deepEqual(calls[0].input, { city: "Hanoi" });
});

test("Workers AI stream handles events split across chunk boundaries", async () => {
	const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: "OK" }, index: 0 }], response: "OK" })}\n\ndata: [DONE]\n\n`;
	const encoder = new TextEncoder();
	const bytes = encoder.encode(payload);
	const splitAt = 12;
	const binding = {
		run: () =>
			Promise.resolve(
				new ReadableStream({
					start(controller) {
						controller.enqueue(bytes.subarray(0, splitAt));
						controller.enqueue(bytes.subarray(splitAt));
						controller.close();
					},
				})
			),
	};
	const agent = await getAgentModel({ AI: binding, DB: createMockDb() });
	assert.ok(agent?.model);
	const result = streamText({ model: agent.model, prompt: "say OK" });
	assert.equal(await result.text, "OK");
});
