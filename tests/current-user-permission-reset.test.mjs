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
	join(project, "node_modules", "permission-user-test-")
);
after(() => rmSync(directory, { force: true, recursive: true }));
await build({
	bundle: true,
	entryPoints: [join(project, "src/hooks/use-current-user.ts")],
	format: "esm",
	logLevel: "silent",
	outfile: join(directory, "user.mjs"),
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
						"export const AUTH_SESSION_CHANGED_EVENT='permission-session-changed';export function authFetch(){return globalThis.fetchUserResponse()}",
					loader: "js",
				}));
			},
		},
	],
});
const { fetchCurrentUser, clearCurrentUserCache, useCurrentUser } =
	await import(pathToFileURL(join(directory, "user.mjs")).href);
const response = (role) => ({
	json: () =>
		Promise.resolve({
			user: {
				canManageDomains: role === "admin",
				id: role,
				isPrimaryAdmin: role === "admin",
				role,
			},
		}),
	ok: true,
});

test("an old account response cannot repopulate permissions or clear the new inflight request", async () => {
	clearCurrentUserCache();
	let newResolve;
	let oldResolve;
	globalThis.fetchUserResponse = () =>
		deferredPromise((resolve) => {
			oldResolve = resolve;
		});
	const oldRequest = fetchCurrentUser();
	clearCurrentUserCache();
	globalThis.fetchUserResponse = () =>
		deferredPromise((resolve) => {
			newResolve = resolve;
		});
	const newRequest = fetchCurrentUser();
	oldResolve(response("admin"));
	assert.equal(await oldRequest, null);
	assert.equal(fetchCurrentUser(), newRequest);
	newResolve(response("user"));
	const awaitedValue1 = await newRequest;
	assert.equal(awaitedValue1.role, "user");
	const awaitedValue2 = await fetchCurrentUser();
	assert.equal(awaitedValue2.canManageDomains, false);
});
test("account switch immediately hides old permission UI until the new account resolves", async () => {
	const dom = new JSDOM("<!doctype html><div id='root'></div>");
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	const { createElement, act } = await import("react");
	const { createRoot } = await import("react-dom/client");
	clearCurrentUserCache();
	globalThis.fetchUserResponse = () => Promise.resolve(response("admin"));
	await fetchCurrentUser();
	function Fixture() {
		const user = useCurrentUser();
		return createElement(
			"div",
			null,
			user?.canManageDomains ? "domain admin" : "no domain permission"
		);
	}
	const root = createRoot(document.querySelector("#root"));
	await act(() => Promise.resolve(root.render(createElement(Fixture))));
	assert.equal(document.body.textContent, "domain admin");
	let resolve;
	globalThis.fetchUserResponse = () =>
		deferredPromise((_resolve) => {
			resolve = _resolve;
		});
	await act(() =>
		Promise.resolve(
			window.dispatchEvent(new dom.window.Event("permission-session-changed"))
		)
	);
	assert.equal(document.body.textContent, "no domain permission");
	await act(() => Promise.resolve(resolve(response("user"))));
	assert.equal(document.body.textContent, "no domain permission");
	await act(() => Promise.resolve(root.unmount()));
	dom.window.close();
	delete globalThis.window;
	delete globalThis.document;
	delete globalThis.IS_REACT_ACT_ENVIRONMENT;
	delete globalThis.fetchUserResponse;
});
