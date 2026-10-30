import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
	new URL("../public/sw.js", import.meta.url),
	"utf-8"
);
test("framework upgrade discards legacy HTML together with Next scripts and keeps current offline pages", async () => {
	const listeners = new Map();
	const stores = new Map([
		[
			"lab-static-v1",
			new Map([
				["https://lab.example/_next/static/old.js", new Response("old script")],
			]),
		],
		[
			"lab-pages-v1",
			new Map([
				[
					"https://lab.example/inbox",
					new Response('<script src="/_next/static/old.js"></script>', {
						headers: { "Content-Type": "text/html" },
					}),
				],
			]),
		],
		["lab-static-v2", new Map()],
		[
			"lab-pages-v2",
			new Map([["https://lab.example/drive", new Response("current page")]]),
		],
		["lab-api-v2-account", new Map()],
	]);
	const caches = {
		delete: (key) => Promise.resolve(stores.delete(key)),
		keys: () => Promise.resolve([...stores.keys()]),
		open: (name) => {
			if (!stores.has(name)) {
				stores.set(name, new Map());
			}
			const store = stores.get(name);
			return Promise.resolve({
				keys: () => Promise.resolve([...store.keys()]),
				match: (request) => Promise.resolve(store.get(request.url)),
			});
		},
	};
	const self = {
		addEventListener: (name, listener) => listeners.set(name, listener),
		clients: { claim: () => Promise.resolve() },
		location: { origin: "https://lab.example" },
	};
	vm.runInNewContext(source, {
		Response,
		URL,
		caches,
		fetch: () => Promise.reject(new Error("offline")),
		self,
		setTimeout: (callback) => {
			callback();
		},
	});
	let pending;
	listeners.get("activate")({
		waitUntil: (promise) => {
			pending = promise;
		},
	});
	await pending;
	assert.equal(stores.has("lab-static-v1"), false);
	assert.equal(stores.has("lab-pages-v1"), false);
	assert.equal(stores.has("lab-api-v2-account"), true);
	async function navigate(path) {
		listeners.get("fetch")({
			request: {
				headers: new Headers(),
				method: "GET",
				mode: "navigate",
				url: `https://lab.example${path}`,
			},
			respondWith: (promise) => {
				pending = promise;
			},
		});
		return await pending;
	}
	const oldPage = await navigate("/inbox");
	assert.equal(oldPage.status, 503);
	assert.doesNotMatch(await oldPage.text(), /_next\/static/);
	const currentPage = await navigate("/drive");
	assert.equal(await currentPage.text(), "current page");
});
