import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.join(import.meta.dirname, "..");
const source = readFileSync(path.join(root, "public/sw.js"), "utf-8");

function countsResponse(unread) {
	return Response.json(
		{ counts: { folders: { inbox: { total: 10, unread } } } },
		{
			headers: { "Content-Type": "application/json" },
			status: 200,
		}
	);
}

async function push({ fetchImpl, visible = false, malformed = false }) {
	const listeners = new Map();
	const calls = { badge: [], fetch: [], notifications: [] };
	const self = {
		addEventListener: (type, listener) => listeners.set(type, listener),
		clients: {
			matchAll: () =>
				Promise.resolve([{ visibilityState: visible ? "visible" : "hidden" }]),
		},
		location: { origin: "https://mail.example.com" },
		navigator: {
			clearAppBadge: () => {
				calls.badge.push(["clear"]);
				return Promise.resolve();
			},
			setAppBadge: (count) => {
				calls.badge.push(["set", count]);
				return Promise.resolve();
			},
		},
		registration: {
			showNotification: (title, options) => {
				calls.notifications.push({ options, title });
				return Promise.resolve();
			},
		},
	};
	const fetch = async (url, init) => {
		calls.fetch.push({ init, url });
		return await fetchImpl();
	};
	vm.runInNewContext(source, { Promise, URL, fetch, self });

	let pending;
	listeners.get("push")({
		data: {
			json: () => {
				if (malformed) {
					throw new SyntaxError("Invalid JSON");
				}
				return { body: "Lunch?", title: "Ada" };
			},
		},
		waitUntil: (promise) => {
			pending = promise;
		},
	});
	await pending;
	return calls;
}

test("a hidden push sets the badge to the all-mailbox inbox unread count", async () => {
	const calls = await push({ fetchImpl: () => countsResponse(7) });
	assert.deepEqual(calls.badge, [["set", 7]]);
	assert.equal(calls.fetch.length, 1);
	assert.equal(calls.fetch[0].url, "/api/messages/counts");
	assert.equal(calls.fetch[0].init.credentials, "include");
	assert.equal(calls.notifications.length, 1);
	assert.equal(calls.notifications[0].title, "Ada");
});

test("a zero unread count clears the badge", async () => {
	const calls = await push({ fetchImpl: () => countsResponse(0) });
	assert.deepEqual(calls.badge, [["clear"]]);
	assert.equal(calls.notifications.length, 1);
});

test("an unauthorized counts response leaves the badge untouched", async () => {
	const calls = await push({
		fetchImpl: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
	});
	assert.equal(calls.fetch.length, 1);
	assert.deepEqual(calls.badge, []);
	assert.equal(calls.notifications.length, 1);
});

test("a failed counts fetch leaves the badge untouched", async () => {
	const calls = await push({
		fetchImpl: () => {
			throw new TypeError("Failed to fetch");
		},
	});
	assert.equal(calls.fetch.length, 1);
	assert.deepEqual(calls.badge, []);
	assert.equal(calls.notifications.length, 1);
});

test("a visible window still displays a notification and updates the badge", async () => {
	const calls = await push({
		fetchImpl: () => countsResponse(3),
		visible: true,
	});
	assert.equal(calls.fetch.length, 1);
	assert.deepEqual(calls.badge, [["set", 3]]);
	assert.equal(calls.notifications.length, 1);
});

test("a malformed push still displays a generic notification as Safari requires", async () => {
	const calls = await push({
		fetchImpl: () => countsResponse(1),
		malformed: true,
	});
	assert.equal(calls.notifications.length, 1);
	assert.equal(calls.notifications[0].title, "New email");
	assert.equal(calls.notifications[0].options.data.url, "/inbox");
});
