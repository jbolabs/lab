import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { JSDOM } from "jsdom";

import { deferredPromise } from "./helpers/deferred.mjs";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const project = join(import.meta.dirname, "..");
const directory = mkdtempSync(
	join(project, "node_modules", "folder-client-test-")
);
after(() => rmSync(directory, { force: true, recursive: true }));
await build({
	bundle: true,
	entryPoints: [join(project, "src/lib/folders/client.ts")],
	format: "esm",
	logLevel: "silent",
	outfile: join(directory, "client.mjs"),
	platform: "node",
	plugins: [
		{
			name: "mock-auth",
			setup(builder) {
				builder.onResolve({ filter: /^@\/lib\/auth\/client$/ }, () => ({
					namespace: "mock",
					path: "auth",
				}));
				builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
					contents: `export const AUTH_SESSION_CHANGED_EVENT = "auth-changed"; export function getClientSessionToken(){return globalThis.sessionToken ?? null;} export function authFetch(...args){return globalThis.folderFetch(...args);}`,
					loader: "js",
				}));
			},
		},
	],
});
const clientUrl = pathToFileURL(join(directory, "client.mjs")).href;
let client;
let dom;
let now;
let originalNow;

function response(folders = []) {
	return { json: () => Promise.resolve({ folders }), ok: true };
}
async function setup() {
	dom = new JSDOM("<!doctype html>");
	globalThis.window = dom.window;
	globalThis.sessionToken = "account-a";
	globalThis.folderFetch = (_url, options) => {
		try {
			assert.equal(options.cache, "no-store");
			return Promise.resolve(response([{ id: "f1" }]));
		} catch (error) {
			return Promise.reject(error);
		}
	};
	originalNow = Date.now;
	now = 1000;
	Date.now = () => now;
	client = await import(`${clientUrl}?run=${Math.random()}`);
}
function cleanup() {
	Date.now = originalNow;
	dom.window.close();
	delete globalThis.window;
	delete globalThis.sessionToken;
	delete globalThis.folderFetch;
}

test("concurrent callers share one no-store fetch and successful data hits the short cache", async () => {
	await setup();
	try {
		let calls = 0;
		globalThis.folderFetch = async () => {
			calls += 1;
			await Promise.resolve();
			return response([{ id: "f1" }]);
		};
		const [a, b] = await Promise.all([
			client.getMailboxFolders("mb1"),
			client.getMailboxFolders("mb1"),
		]);
		assert.deepEqual(a, b);
		assert.equal(calls, 1);
		await client.getMailboxFolders("mb1");
		assert.equal(calls, 1);
	} finally {
		cleanup();
	}
});

test("cache expires after 15 seconds", async () => {
	await setup();
	try {
		let calls = 0;
		globalThis.folderFetch = () => {
			try {
				calls += 1;
				return Promise.resolve(response());
			} catch (error) {
				return Promise.reject(error);
			}
		};
		await client.getMailboxFolders("mb1");
		now += 15_001;
		await client.getMailboxFolders("mb1");
		assert.equal(calls, 2);
	} finally {
		cleanup();
	}
});

test("cache evicts its oldest entry after 32 mailbox entries", async () => {
	await setup();
	try {
		let calls = 0;
		globalThis.folderFetch = () => {
			try {
				calls += 1;
				return Promise.resolve(response());
			} catch (error) {
				return Promise.reject(error);
			}
		};
		for (let index = 0; index < 33; index += 1) {
			await client.getMailboxFolders(`mb${index}`);
		}
		await client.getMailboxFolders("mb0");
		assert.equal(calls, 34);
	} finally {
		cleanup();
	}
});

test("session and event invalidation reject stale responses without disturbing a newer request", async () => {
	await setup();
	try {
		let resolveOld;
		globalThis.folderFetch = () =>
			deferredPromise((resolve) => {
				resolveOld = resolve;
			});
		const old = client.getMailboxFolders("mb1");
		await Promise.resolve();
		globalThis.sessionToken = "account-b";
		window.dispatchEvent(new window.Event("auth-changed"));
		let resolveNew;
		globalThis.folderFetch = () =>
			deferredPromise((resolve) => {
				resolveNew = resolve;
			});
		const fresh = client.getMailboxFolders("mb1");
		await Promise.resolve();
		resolveOld(response([{ id: "old" }]));
		await assert.rejects(old, /invalidated/u);
		resolveNew(response([{ id: "new" }]));
		const awaitedValue1 = await fresh;
		assert.deepEqual(awaitedValue1.folders, [{ id: "new" }]);
		const awaitedValue2 = await client.getMailboxFolders("mb1");
		assert.deepEqual(awaitedValue2.folders, [{ id: "new" }]);
	} finally {
		cleanup();
	}
});

test("messages and folders events invalidate in-flight and cached data", async () => {
	await setup();
	try {
		let calls = 0;
		globalThis.folderFetch = () => {
			try {
				calls += 1;
				return Promise.resolve(response([{ id: String(calls) }]));
			} catch (error) {
				return Promise.reject(error);
			}
		};
		await client.getMailboxFolders("mb1");
		window.dispatchEvent(new window.Event("mailflare:messages-changed"));
		await client.getMailboxFolders("mb1");
		window.dispatchEvent(new window.Event("mailflare:folders-changed"));
		await client.getMailboxFolders("mb1");
		assert.equal(calls, 3);
	} finally {
		cleanup();
	}
});

test("pending callers receive fresh folders after a messages event", async () => {
	await setup();
	try {
		const resolvers = [];
		globalThis.folderFetch = () =>
			deferredPromise((resolve) => {
				resolvers.push(resolve);
			});
		const first = client.getMailboxFolders("mb1");
		const second = client.getMailboxFolders("mb1");
		assert.equal(resolvers.length, 1);
		window.dispatchEvent(new window.Event("mailflare:messages-changed"));
		resolvers[0](response([{ id: "stale" }]));
		await deferredPromise((resolve) => {
			setImmediate(resolve);
		});
		assert.equal(resolvers.length, 2);
		resolvers[1](response([{ id: "fresh" }]));
		const awaitedValue3 = await first;
		assert.deepEqual(awaitedValue3.folders, [{ id: "fresh" }]);
		const awaitedValue4 = await second;
		assert.deepEqual(awaitedValue4.folders, [{ id: "fresh" }]);
		assert.equal(resolvers.length, 2);
	} finally {
		cleanup();
	}
});

function registerInvalidationTest(invalidation) {
	test(`pending caller retries after ${invalidation}`, async () => {
		await setup();
		try {
			const resolvers = [];
			globalThis.folderFetch = () =>
				deferredPromise((resolve) => {
					resolvers.push(resolve);
				});
			const pending = client.getMailboxFolders("mb1");
			if (invalidation === "explicit invalidation") {
				client.invalidateFolderCache();
			} else {
				window.dispatchEvent(new window.Event(invalidation));
			}
			resolvers[0](response([{ id: "stale" }]));
			await deferredPromise((resolve) => {
				setImmediate(resolve);
			});
			assert.equal(resolvers.length, 2);
			resolvers[1](response([{ id: "fresh" }]));
			const awaitedValue5 = await pending;
			assert.deepEqual(awaitedValue5.folders, [{ id: "fresh" }]);
		} finally {
			cleanup();
		}
	});
}

for (const invalidation of [
	"mailflare:folders-changed",
	"explicit invalidation",
]) {
	registerInvalidationTest(invalidation);
}

test("a stale caller joins the replacement request without overwriting it", async () => {
	await setup();
	try {
		const resolvers = [];
		globalThis.folderFetch = () =>
			deferredPromise((resolve) => {
				resolvers.push(resolve);
			});
		const staleCaller = client.getMailboxFolders("mb1");
		window.dispatchEvent(new window.Event("mailflare:messages-changed"));
		const freshCaller = client.getMailboxFolders("mb1");
		assert.equal(resolvers.length, 2);
		resolvers[0](response([{ id: "stale" }]));
		await deferredPromise((resolve) => {
			setImmediate(resolve);
		});
		assert.equal(resolvers.length, 2);
		resolvers[1](response([{ id: "fresh" }]));
		const awaitedValue6 = await staleCaller;
		assert.deepEqual(awaitedValue6.folders, [{ id: "fresh" }]);
		const awaitedValue7 = await freshCaller;
		assert.deepEqual(awaitedValue7.folders, [{ id: "fresh" }]);
		const awaitedValue8 = await client.getMailboxFolders("mb1");
		assert.deepEqual(awaitedValue8.folders, [{ id: "fresh" }]);
	} finally {
		cleanup();
	}
});

test("session event rejects an old request even when its token has not changed yet", async () => {
	await setup();
	try {
		let resolveOld;
		globalThis.folderFetch = () =>
			deferredPromise((resolve) => {
				resolveOld = resolve;
			});
		const old = client.getMailboxFolders("mb1");
		window.dispatchEvent(new window.Event("auth-changed"));
		resolveOld(response([{ id: "old" }]));
		await assert.rejects(old, /invalidated/u);
	} finally {
		cleanup();
	}
});

test("continuous invalidation has a bounded retry count", async () => {
	await setup();
	try {
		let calls = 0;
		globalThis.folderFetch = () =>
			Promise.resolve({
				json: () => {
					try {
						calls += 1;
						window.dispatchEvent(
							new window.Event("mailflare:messages-changed")
						);
						return Promise.resolve({ folders: [{ id: String(calls) }] });
					} catch (error) {
						return Promise.reject(error);
					}
				},
				ok: true,
			});
		await assert.rejects(client.getMailboxFolders("mb1"), /invalidated/u);
		assert.equal(calls, 9);
	} finally {
		cleanup();
	}
});

test("failed responses are not cached and explicit mutation invalidation clears cache", async () => {
	await setup();
	try {
		let calls = 0;
		globalThis.folderFetch = () => {
			try {
				calls += 1;
				return Promise.resolve(
					calls === 1
						? { json: () => Promise.resolve({ error: "failed" }), ok: false }
						: response()
				);
			} catch (error) {
				return Promise.reject(error);
			}
		};
		await assert.rejects(client.getMailboxFolders("mb1"), /failed/u);
		await client.getMailboxFolders("mb1");
		assert.equal(calls, 2);
		client.invalidateFolderCache();
		await client.getMailboxFolders("mb1");
		assert.equal(calls, 3);
	} finally {
		cleanup();
	}
});
