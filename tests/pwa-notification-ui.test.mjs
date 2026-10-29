import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after } from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const directory = mkdtempSync(join(process.cwd(), "node_modules", "push-ui-test-"));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({ stdin: { contents: 'export {PwaServiceWorker} from "./src/components/pwa-service-worker";export {PushNotificationSettings} from "./src/components/settings/push-notification-settings";', resolveDir: process.cwd(), loader: "tsx" }, outfile: join(directory, "ui.mjs"), bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", logLevel: "silent", plugins: [{ name: "dependencies", setup(builder) {
 builder.onResolve({ filter: /^@\/lib\/push\/client$|^@\/lib\/auth\/client$|^@\/components\/language-provider$/ }, args => ({ path: args.path, namespace: "mock" }));
 builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ loader: "js", contents: path.includes("push/client")
  ? 'export const PUSH_STATE_CHANGED_EVENT="push-state";export const getPushState=()=>globalThis.getTestPushState();export const registerMailflareServiceWorker=()=>globalThis.registerTestWorker();export const enablePushNotifications=()=>globalThis.enableTestPush();export const disablePushNotifications=async()=>{};'
  : path.includes("auth/client") ? 'export const AUTH_SESSION_CHANGED_EVENT="auth-state";export const getClientSessionToken=()=>"fixture-session";'
  : 'const t=key=>key;export const useLanguage=()=>({t});' }));
} }] });
const { PwaServiceWorker, PushNotificationSettings } = await import(pathToFileURL(join(directory, "ui.mjs")).href);

async function withDom(run) {
 const dom = new JSDOM("<!doctype html><div id='root'></div>", { pretendToBeVisual: true });
 globalThis.window = dom.window;
 globalThis.document = dom.window.document;
 globalThis.HTMLFormElement = dom.window.HTMLFormElement;
 globalThis.IS_REACT_ACT_ENVIRONMENT = true;
 Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: {} } });
 const root = createRoot(document.getElementById("root"));
 try { await run(root); } finally {
  await act(async () => root.unmount());
  dom.window.close();
  delete globalThis.HTMLFormElement; delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  delete globalThis.getTestPushState; delete globalThis.registerTestWorker; delete globalThis.enableTestPush;
 }
}

test("an authenticated iPhone Safari tab registers and refreshes its worker independently of push eligibility", async () => {
 await withDom(async root => {
  let registrations = 0;
  globalThis.registerTestWorker = async () => { registrations++; };
  globalThis.getTestPushState = async () => ({ needsInstall: true, supported: false });
  await act(async () => root.render(createElement(PwaServiceWorker)));
  assert.equal(registrations, 1);
  await act(async () => document.dispatchEvent(new window.Event("visibilitychange")));
  assert.equal(registrations, 2);
 });
});

test("denying permission immediately shows blocked guidance and disables the switch while retaining the error", async () => {
 await withDom(async root => {
  let permission = "default";
  globalThis.getTestPushState = async () => ({ needsInstall: false, supported: true, configured: true, permission, subscribed: false });
  globalThis.enableTestPush = async () => { permission = "denied"; throw new Error("Permission denied"); };
  await act(async () => root.render(createElement(PushNotificationSettings)));
  const toggle = document.querySelector('[role="switch"]');
  assert.equal(toggle.disabled, false);
  await act(async () => toggle.click());
  assert.equal(toggle.disabled, true);
  assert.match(document.body.textContent, /settings.push.blocked/);
  assert.match(document.body.textContent, /settings.push.updateFailed/);
 });
});
