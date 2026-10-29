import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

import { deferredPromise } from "./helpers/deferred.mjs";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const project = join(import.meta.dirname, "..");
const temporary = mkdtempSync(
	join(project, "node_modules", "detail-cache-test-")
);
const target = join(temporary, "cache.mjs");
await build({
	bundle: true,
	entryPoints: [join(project, "src/lib/messages/detail-cache.ts")],
	format: "esm",
	logLevel: "silent",
	outfile: target,
	packages: "external",
	platform: "node",
	plugins: [
		{
			name: "test-auth",
			setup(builder) {
				builder.onResolve({ filter: /^@\/lib\/auth\/client$/ }, () => ({
					namespace: "mock",
					path: "auth",
				}));
				builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
					contents:
						"export const AUTH_SESSION_CHANGED_EVENT='session-changed';export function authFetch(...args){return globalThis.detailFetch(...args)}",
					loader: "js",
				}));
			},
		},
	],
});
const cache = await import(pathToFileURL(target).href);
const data = (id) => ({
	body: { htmlBody: null, textBody: id },
	message: { id, read: false },
});
const response = (value, ok = true) => ({
	json: () => Promise.resolve(value),
	ok,
});
after(() => {
	rmSync(temporary, { force: true, recursive: true });
	delete globalThis.detailFetch;
});

test("concurrent detail and forced refresh callers share one request; cached reopen needs none", async () => {
	cache.clearMessageDetailCache();
	let resolve;
	let requests = 0;
	globalThis.detailFetch = (url, init) => {
		requests += 1;
		assert.equal(init.cache, "no-store");
		return deferredPromise((_resolve) => {
			resolve = _resolve;
		});
	};
	const first = cache.fetchCachedMessageDetail("one");
	const second = cache.fetchCachedMessageDetail("one", true);
	assert.equal(requests, 1);
	resolve(response(data("one")));
	assert.deepEqual(await first, await second);
	assert.deepEqual(await cache.fetchCachedMessageDetail("one"), data("one"));
	assert.equal(requests, 1);
});

test("cache invalidation blocks old account data and preserves a newer pending request", async () => {
	cache.clearMessageDetailCache();
	let resolveNew;
	let resolveOld;
	let requests = 0;
	globalThis.detailFetch = () =>
		deferredPromise((_resolve) => {
			requests += 1;
			resolveOld = _resolve;
		});
	const old = cache.fetchCachedMessageDetail("one");
	const rejected = assert.rejects(old, /invalidated/u);
	cache.clearMessageDetailCache();
	globalThis.detailFetch = () =>
		deferredPromise((_resolve) => {
			requests += 1;
			resolveNew = _resolve;
		});
	const fresh = cache.fetchCachedMessageDetail("one");
	resolveOld(response(data("old")));
	await rejected;
	assert.equal(cache.getCachedMessageDetail("one"), undefined);
	const concurrent = cache.fetchCachedMessageDetail("one");
	assert.equal(requests, 2);
	resolveNew(response(data("new")));
	assert.deepEqual(await concurrent, await fresh);
	assert.equal(cache.getCachedMessageDetail("one").message.id, "new");
});

test("failed HTTP responses and network errors are retried rather than cached", async () => {
	cache.clearMessageDetailCache();
	let requests = 0;
	globalThis.detailFetch = () => {
		try {
			requests += 1;
			return Promise.resolve(response({ error: "Forbidden" }, false));
		} catch (error) {
			return Promise.reject(error);
		}
	};
	await cache.fetchCachedMessageDetail("one");
	await cache.fetchCachedMessageDetail("one");
	assert.equal(requests, 2);
	assert.equal(cache.getCachedMessageDetail("one"), undefined);
	globalThis.detailFetch = () => {
		try {
			throw new Error("offline");
		} catch (error) {
			return Promise.reject(error);
		}
	};
	await assert.rejects(cache.fetchCachedMessageDetail("one"), /offline/u);
	globalThis.detailFetch = () => Promise.resolve(response(data("one")));
	const awaitedValue1 = await cache.fetchCachedMessageDetail("one");
	assert.equal(awaitedValue1.message.id, "one");
});

test("details expire after five minutes; storage is bounded and read-state updates still work", async () => {
	cache.clearMessageDetailCache();
	const { now } = Date;
	let time = 1000;
	Date.now = () => time;
	try {
		globalThis.detailFetch = () => Promise.resolve(response(data("one")));
		await cache.fetchCachedMessageDetail("one");
		cache.setCachedMessageRead("one", true);
		assert.equal(cache.getCachedMessageDetail("one").message.read, true);
		time += 300_001;
		assert.equal(cache.getCachedMessageDetail("one"), undefined);
		for (let index = 0; index < 51; index += 1) {
			cache.primeMessageDetail({ id: String(index), textBody: "body" });
		}
		assert.equal(cache.getCachedMessageDetail("0"), undefined);
		assert.equal(cache.getCachedMessageDetail("50").body.textBody, "body");
	} finally {
		Date.now = now;
	}
});
