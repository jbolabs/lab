import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { installDomGlobals } from "./helpers/dom.mjs";

const directory = mkdtempSync(
	path.join(process.cwd(), "node_modules", "push-ui-test-")
);
after(() => rmSync(directory, { force: true, recursive: true }));
await build({
	bundle: true,
	format: "esm",
	jsx: "automatic",
	logLevel: "silent",
	outfile: path.join(directory, "ui.mjs"),
	packages: "external",
	platform: "node",
	plugins: [
		{
			name: "dependencies",
			setup(builder) {
				builder.onResolve(
					{
						filter:
							/^@\/lib\/push\/client$|^@\/lib\/auth\/client$|^@\/components\/language-provider$/,
					},
					(args) => ({ namespace: "mock", path: args.path })
				);
				builder.onLoad(
					{ filter: /.*/, namespace: "mock" },
					({ path: modulePath }) => {
						let contents =
							"const t=key=>key;export const useLanguage=()=>({t});";
						if (modulePath.includes("push/client")) {
							contents =
								'export const PUSH_STATE_CHANGED_EVENT="push-state";export const getPushState=()=>globalThis.getTestPushState();export const registerMailflareServiceWorker=()=>globalThis.registerTestWorker();export const enablePushNotifications=()=>globalThis.enableTestPush();export const disablePushNotifications=async()=>{};';
						} else if (modulePath.includes("auth/client")) {
							contents =
								'export const AUTH_SESSION_CHANGED_EVENT="auth-state";export const getClientSessionToken=()=>"fixture-session";';
						}
						return { contents, loader: "js" };
					}
				);
			},
		},
	],
	stdin: {
		contents:
			'export {PwaServiceWorker} from "./src/components/pwa-service-worker";export {PushNotificationSettings} from "./src/components/settings/push-notification-settings";',
		loader: "tsx",
		resolveDir: process.cwd(),
	},
});
const { PwaServiceWorker, PushNotificationSettings } = await import(
	pathToFileURL(path.join(directory, "ui.mjs")).href
);

async function withDom(run) {
	const dom = new JSDOM("<!doctype html><div id='root'></div>", {
		pretendToBeVisual: true,
	});
	const removeDomGlobals = installDomGlobals(dom);
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { serviceWorker: {} },
	});
	const root = createRoot(document.querySelector("#root"));
	try {
		await run(root);
	} finally {
		await act(() => root.unmount());
		dom.window.close();
		removeDomGlobals();
		delete globalThis.IS_REACT_ACT_ENVIRONMENT;
		delete globalThis.getTestPushState;
		delete globalThis.registerTestWorker;
		delete globalThis.enableTestPush;
	}
}

test("an authenticated iPhone Safari tab registers and refreshes its worker independently of push eligibility", async () => {
	await withDom(async (root) => {
		let registrations = 0;
		globalThis.registerTestWorker = () => {
			registrations += 1;
			return Promise.resolve();
		};
		globalThis.getTestPushState = () =>
			Promise.resolve({
				needsInstall: true,
				supported: false,
			});
		await act(() => root.render(createElement(PwaServiceWorker)));
		assert.equal(registrations, 1);
		await act(() =>
			document.dispatchEvent(new window.Event("visibilitychange"))
		);
		assert.equal(registrations, 2);
	});
});

test("denying permission immediately shows blocked guidance and disables the switch while retaining the error", async () => {
	await withDom(async (root) => {
		let permission = "default";
		globalThis.getTestPushState = () =>
			Promise.resolve({
				configured: true,
				needsInstall: false,
				permission,
				subscribed: false,
				supported: true,
			});
		globalThis.enableTestPush = () => {
			permission = "denied";
			return Promise.reject(new Error("Permission denied"));
		};
		await act(() => root.render(createElement(PushNotificationSettings)));
		const toggle = document.querySelector('[role="switch"]');
		assert.equal("disabled" in toggle.dataset, false);
		await act(() => toggle.click());
		assert.equal("disabled" in toggle.dataset, true);
		assert.match(document.body.textContent, /settings.push.blocked/);
		assert.match(document.body.textContent, /settings.push.updateFailed/);
	});
});
