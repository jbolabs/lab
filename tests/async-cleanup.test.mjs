import assert from "node:assert/strict";
import test from "node:test";

import {
	requireActionEntity,
	requireSuccessfulResponse,
	runAsyncAction,
	withCleanup,
} from "../src/lib/async-cleanup.ts";

test("cleanup completes before an early-returning action settles", async () => {
	const events = [];
	const result = await withCleanup(
		() => Promise.resolve(),
		async () => {
			await Promise.resolve();
			events.push("released");
		}
	);
	assert.equal(result, undefined);
	assert.deepEqual(events, ["released"]);
});

test("a failed action preserves its error and releases pending state", async () => {
	const failure = new Error("request failed");
	let pending = true;
	await assert.rejects(
		withCleanup(
			() => Promise.reject(failure),
			() => {
				pending = false;
			}
		),
		failure
	);
	assert.equal(pending, false);
});

test("admin recovery handles synchronous failures and awaits settlement", async () => {
	const events = [];
	const failure = new Error("synchronous failure");
	const result = await runAsyncAction(
		() => {
			throw failure;
		},
		(error) => {
			assert.equal(error, failure);
			events.push("recovered");
			return "fallback";
		},
		async () => {
			await Promise.resolve();
			events.push("settled");
		}
	);
	assert.equal(result, "fallback");
	assert.deepEqual(events, ["recovered", "settled"]);
});

test("failed recovery still releases pending state", async () => {
	const failure = new Error("recovery failed");
	let pending = true;
	await assert.rejects(
		runAsyncAction(
			() => Promise.reject(new Error("request failed")),
			() => {
				throw failure;
			},
			() => {
				pending = false;
			}
		),
		failure
	);
	assert.equal(pending, false);
});

test("mutation boundaries reject failed responses and missing entities", () => {
	const entity = { id: "saved" };
	requireSuccessfulResponse({ ok: true });
	assert.equal(requireActionEntity(entity), entity);
	assert.throws(() => requireSuccessfulResponse({ ok: false }, "failed"), {
		message: "failed",
	});
	assert.throws(() => requireActionEntity(null, "missing"), {
		message: "missing",
	});
});
