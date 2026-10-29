import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";
import { build } from "esbuild";

const directory = mkdtempSync(join(tmpdir(), "lab-push-client-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({ entryPoints: ["src/lib/push/client.ts"], outfile: join(directory, "client.mjs"), bundle: true, platform: "node", format: "esm", logLevel: "silent", plugins: [{ name: "auth", setup(builder) {
 builder.onResolve({ filter: /^@\/lib\/auth\/client$/ }, () => ({ path: "auth", namespace: "mock" }));
 builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export const getClientSessionToken=()=>globalThis.token; export const authFetch=(...args)=>globalThis.fetchPush(...args);", loader: "js" }));
} }] });
const client = await import(pathToFileURL(join(directory, "client.mjs")).href);

function setup({ installed = true, ios = true, permission = "granted", subscribed = true, stored = null } = {}) {
 const calls = [];
 const storage = new Map(stored === null ? [] : [["mailflare:push-enabled", stored]]);
 const subscription = { endpoint: "https://web.push.apple.com/test", toJSON: () => ({ endpoint: "https://web.push.apple.com/test", keys: { p256dh: "key", auth: "auth" } }), unsubscribe: async () => { calls.push("unsubscribe"); current = null; return true; } };
 let current = subscribed ? subscription : null;
 const registration = { pushManager: { getSubscription: async () => current, subscribe: async () => { calls.push("subscribe"); current = subscription; return subscription; } } };
 globalThis.token = "account-a";
 globalThis.window = { isSecureContext: true, PushManager: {}, Notification: {}, matchMedia: () => ({ matches: installed }), dispatchEvent: () => {} };
 globalThis.document = { visibilityState: "visible" };
 globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
 Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
  userAgent: ios ? "iPhone" : "Desktop", platform: ios ? "iPhone" : "MacIntel", maxTouchPoints: ios ? 5 : 0,
  serviceWorker: { register: async () => { calls.push("register"); return registration; }, ready: Promise.resolve(registration), getRegistration: async () => registration },
 } });
 globalThis.Notification = { permission, requestPermission: async () => { calls.push("permission"); Notification.permission = "granted"; return "granted"; } };
 globalThis.fetchPush = async (url, options) => {
  calls.push({ url, options });
  return new Response(JSON.stringify(url.endsWith("config") ? { enabled: true, publicKey: "BAAA" } : { ok: true }), { status: 200 });
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
 assert.equal((await client.getPushState()).subscribed, true);
 const saved = calls.find(call => call.url?.endsWith("subscriptions"));
 assert.equal(saved.options.headers.Authorization, "Bearer account-a");
 assert.equal(storage.get("mailflare:push-enabled"), "true");
 assert.equal(calls.includes("permission"), false);
});

test("expired subscriptions renew only after a prior opt-in", async () => {
 let fixture = setup({ subscribed: false, stored: "true" });
 assert.equal((await client.getPushState()).subscribed, true);
 assert.equal(fixture.calls.includes("subscribe"), true);
 fixture = setup({ subscribed: false });
 assert.equal((await client.getPushState()).subscribed, false);
 assert.equal(fixture.calls.includes("subscribe"), false);
});

test("granted browser permission alone never overrides an opt-out", async () => {
 const { calls } = setup({ stored: "false" });
 assert.equal((await client.getPushState()).subscribed, false);
 assert.equal(calls.some(call => call.url?.endsWith("subscriptions")), false);
 assert.equal(calls.includes("subscribe"), false);
});

test("a denied permission is never prompted or renewed by launch refresh", async () => {
 const { calls } = setup({ permission: "denied", stored: "true", subscribed: false });
 assert.equal((await client.getPushState()).permission, "denied");
 assert.equal(calls.includes("permission"), false);
 assert.equal(calls.includes("subscribe"), false);
});

test("enable requests permission synchronously from the tap before network work", async () => {
 const { calls } = setup({ subscribed: false, permission: "default" });
 const enabling = client.enablePushNotifications();
 assert.deepEqual(calls, ["permission"]);
 await enabling;
 assert.equal(calls.includes("subscribe"), true);
});

test("logout/account changes during config fetch cannot register the old subscription to another account", async () => {
 const { calls } = setup();
 const original = globalThis.fetchPush;
 globalThis.fetchPush = async (...args) => { const response = await original(...args); globalThis.token = "account-b"; return response; };
 await assert.rejects(client.getPushState(), /account changed/);
 assert.equal(calls.some(call => call.url?.endsWith("subscriptions")), false);
});

test("an opt-out queued behind launch refresh is final and remains off on the next resume", async () => {
 const { calls, storage } = setup();
 const refreshing = client.getPushState();
 const disabling = client.disablePushNotifications();
 await Promise.all([refreshing, disabling]);
 assert.equal(storage.get("mailflare:push-enabled"), "false");
 const writes = calls.filter(call => call.url?.endsWith("subscriptions"));
 assert.deepEqual(writes.map(call => call.options.method), ["POST", "DELETE"]);
 assert.equal((await client.getPushState()).subscribed, false);
 assert.equal(calls.includes("subscribe"), false);
});

test("a failed server opt-out retains the opt-in and reports a recoverable error", async () => {
 const { storage, calls } = setup({ stored: "true" });
 globalThis.fetchPush = async () => new Response("unavailable", { status: 503 });
 await assert.rejects(client.disablePushNotifications(), /Could not turn off/);
 assert.equal(storage.get("mailflare:push-enabled"), "true");
 assert.equal(calls.includes("unsubscribe"), false);
});

test("a browser that requires a gesture to renew leaves a usable off switch without prompting", async () => {
 const { calls } = setup({ subscribed: false, stored: "true" });
 navigator.serviceWorker.ready.then(registration => {
  registration.pushManager.subscribe = async () => { throw new Error("User gesture required"); };
 });
 const state = await client.getPushState();
 assert.equal(state.supported, true);
 assert.equal(state.configured, true);
 assert.equal(state.subscribed, false);
 assert.equal(calls.includes("permission"), false);
});
