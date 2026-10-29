import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const directory = mkdtempSync(path.join(tmpdir(), "lab-push-client-"));
after(() => rmSync(directory, { force: true, recursive: true }));
await build({
	bundle: true,
	entryPoints: ["src/lib/push/client.ts"],
	format: "esm",
	logLevel: "silent",
	outfile: path.join(directory, "client.mjs"),
	platform: "node",
	plugins: [
		{
			name: "auth",
			setup(builder) {
				builder.onResolve({ filter: /^@\/lib\/auth\/client$/ }, () => ({
					namespace: "mock",
					path: "auth",
				}));
				builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
					contents:
						"export const getClientSessionToken=()=>globalThis.token; export const authFetch=(...args)=>globalThis.fetchPush(...args);",
					loader: "js",
				}));
			},
		},
	],
});
const client = await import(
	pathToFileURL(path.join(directory, "client.mjs")).href
);

function setup({
	installed = true,
	ios = true,
	permission = "granted",
	subscribed = true,
	stored = null,
} = {}) {
	const calls = [];
	const storage = new Map(
		stored === null ? [] : [["mailflare:push-enabled", stored]]
	);
	let current = null;
	const subscription = {
		endpoint: "https://web.push.apple.com/test",
		toJSON: () => ({
			endpoint: "https://web.push.apple.com/test",
			keys: { auth: "auth", p256dh: "key" },
		}),
		unsubscribe: () => {
			calls.push("unsubscribe");
			current = null;
			return Promise.resolve(true);
		},
	};
	current = subscribed ? subscription : null;
	const registration = {
		pushManager: {
			getSubscription: () => Promise.resolve(current),
			subscribe: () => {
				calls.push("subscribe");
				current = subscription;
				return Promise.resolve(subscription);
			},
		},
	};
	globalThis.token = "account-a";
	globalThis.window = {
		Notification: {},
		PushManager: {},
		dispatchEvent: () => {},
		isSecureContext: true,
		matchMedia: () => ({ matches: installed }),
	};
	globalThis.document = { visibilityState: "visible" };
	globalThis.localStorage = {
		getItem: (key) => storage.get(key) ?? null,
		setItem: (key, value) => storage.set(key, value),
	};
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: {
			maxTouchPoints: ios ? 5 : 0,
			platform: ios ? "iPhone" : "MacIntel",
			serviceWorker: {
				getRegistration: () => Promise.resolve(registration),
				ready: Promise.resolve(registration),
				register: () => {
					calls.push("register");
					return Promise.resolve(registration);
				},
			},
			userAgent: ios ? "iPhone" : "Desktop",
		},
	});
	globalThis.Notification = {
		permission,
		requestPermission: () => {
			calls.push("permission");
			Notification.permission = "granted";
			return Promise.resolve("granted");
		},
	};
	globalThis.fetchPush = (url, options) => {
		calls.push({ options, url });
		return Promise.resolve(
			Response.json(
				url.endsWith("config")
					? { enabled: true, publicKey: "BAAA" }
					: { ok: true },
				{ status: 200 }
			)
		);
	};
	return { calls, storage, subscription };
}

test("an iPhone Safari tab explains installation without asking permission or contacting the server", async () => {
	const { calls } = setup({ installed: false });
	const state = await client.getPushState();
	assert.equal(state.needsInstall, true);
	assert.equal(state.subscribed, false);
	assert.deepEqual(calls, []);
});

test("touchscreen iPad desktop user agents also require installation", () => {
	setup({ installed: false, ios: false });
	navigator.maxTouchPoints = 5;
	assert.equal(client.needsHomeScreenInstall(), true);
	navigator.standalone = true;
	assert.equal(client.needsHomeScreenInstall(), false);
});

test("launch refreshes existing subscriptions using the captured session without a permission prompt", async () => {
	const { calls, storage } = setup();
	const state = await client.getPushState();
	assert.equal(state.subscribed, true);
	const saved = calls.find((call) => call.url?.endsWith("subscriptions"));
	assert.equal(saved.options.headers.Authorization, "Bearer account-a");
	assert.equal(storage.get("mailflare:push-enabled"), "true");
	assert.equal(calls.includes("permission"), false);
});

test("expired subscriptions renew only after a prior opt-in", async () => {
	let fixture = setup({ stored: "true", subscribed: false });
	const renewedState = await client.getPushState();
	assert.equal(renewedState.subscribed, true);
	assert.equal(fixture.calls.includes("subscribe"), true);
	fixture = setup({ subscribed: false });
	const unsubscribedState = await client.getPushState();
	assert.equal(unsubscribedState.subscribed, false);
	assert.equal(fixture.calls.includes("subscribe"), false);
});

test("granted browser permission alone never overrides an opt-out", async () => {
	const { calls } = setup({ stored: "false" });
	const state = await client.getPushState();
	assert.equal(state.subscribed, false);
	assert.equal(
		calls.some((call) => call.url?.endsWith("subscriptions")),
		false
	);
	assert.equal(calls.includes("subscribe"), false);
});

test("a denied permission is never prompted or renewed by launch refresh", async () => {
	const { calls } = setup({
		permission: "denied",
		stored: "true",
		subscribed: false,
	});
	const state = await client.getPushState();
	assert.equal(state.permission, "denied");
	assert.equal(calls.includes("permission"), false);
	assert.equal(calls.includes("subscribe"), false);
});

test("enable requests permission synchronously from the tap before network work", async () => {
	const { calls } = setup({ permission: "default", subscribed: false });
	const enabling = client.enablePushNotifications();
	assert.deepEqual(calls, ["permission"]);
	await enabling;
	assert.equal(calls.includes("subscribe"), true);
});

test("logout/account changes during config fetch cannot register the old subscription to another account", async () => {
	const { calls } = setup();
	const original = globalThis.fetchPush;
	globalThis.fetchPush = async (...args) => {
		const response = await original(...args);
		globalThis.token = "account-b";
		return response;
	};
	await assert.rejects(client.getPushState(), /account changed/);
	assert.equal(
		calls.some((call) => call.url?.endsWith("subscriptions")),
		false
	);
});

test("an opt-out queued behind launch refresh is final and remains off on the next resume", async () => {
	const { calls, storage } = setup();
	const refreshing = client.getPushState();
	const disabling = client.disablePushNotifications();
	await Promise.all([refreshing, disabling]);
	assert.equal(storage.get("mailflare:push-enabled"), "false");
	const writes = calls.filter((call) => call.url?.endsWith("subscriptions"));
	assert.deepEqual(
		writes.map((call) => call.options.method),
		["POST", "DELETE"]
	);
	const state = await client.getPushState();
	assert.equal(state.subscribed, false);
	assert.equal(calls.includes("subscribe"), false);
});

test("a failed server opt-out retains the opt-in and reports a recoverable error", async () => {
	const { storage, calls } = setup({ stored: "true" });
	globalThis.fetchPush = () =>
		Promise.resolve(new Response("unavailable", { status: 503 }));
	await assert.rejects(client.disablePushNotifications(), /Could not turn off/);
	assert.equal(storage.get("mailflare:push-enabled"), "true");
	assert.equal(calls.includes("unsubscribe"), false);
});

test("a browser that requires a gesture to renew leaves a usable off switch without prompting", async () => {
	const { calls } = setup({ stored: "true", subscribed: false });
	const registration = await navigator.serviceWorker.ready;
	registration.pushManager.subscribe = () =>
		Promise.reject(new Error("User gesture required"));
	const state = await client.getPushState();
	assert.equal(state.supported, true);
	assert.equal(state.configured, true);
	assert.equal(state.subscribed, false);
	assert.equal(calls.includes("permission"), false);
});
