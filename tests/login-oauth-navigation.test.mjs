import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { JSDOM } from "jsdom";

import { installDomGlobals } from "./helpers/dom.mjs";

const project = path.join(import.meta.dirname, "..");
const directory = mkdtempSync(
	path.join(project, "node_modules/login-navigation-test-")
);
after(() => rmSync(directory, { force: true, recursive: true }));
const outfile = path.join(directory, "login.mjs");
await build({
	bundle: true,
	define: { "window.location.replace": "globalThis.replaceDocument" },
	entryPoints: ["src/app/(auth)/login/login-client.tsx"],
	format: "esm",
	jsx: "automatic",
	logLevel: "silent",
	outfile,
	packages: "external",
	platform: "node",
	plugins: [
		{
			name: "login-boundaries",
			setup(builder) {
				builder.onResolve(
					{
						filter:
							/^(?:@\/lib\/navigation|@\/components\/(?:language-provider|auth\/auth-shell|auth\/turnstile|app-link)|\.\/utils)$/,
					},
					(args) => ({ namespace: "fixture", path: args.path })
				);
				builder.onLoad(
					{ filter: /.*/, namespace: "fixture" },
					({ path: modulePath }) => ({
						contents: (() => {
							if (modulePath === "@/lib/navigation") {
								return "export function useRouter(){return globalThis.testRouter}";
							}
							if (modulePath === "./utils") {
								return 'export async function submitLogin(){return {ok:true,data:globalThis.loginResponse}} export async function submitMfaCode(){return {ok:true,data:{redirect:"/inbox"}}}';
							}
							if (modulePath.endsWith("language-provider")) {
								return "export function useLanguage(){return {t:key=>key}}";
							}
							if (modulePath.endsWith("auth-shell")) {
								return "export function AuthShell({children}){return children}";
							}
							if (modulePath.endsWith("turnstile")) {
								return "export function TurnstileField(){return null}";
							}
							return 'import {createElement} from "react";export default function Link(props){return createElement("a",props)}';
						})(),
						loader: "js",
						resolveDir: project,
					})
				);
			},
		},
	],
});
for (const mfa of [false, true]) {
	test(`OAuth login resumes with a document request (${mfa ? "MFA" : "password"})`, async () => {
		const dom = new JSDOM('<!doctype html><div id="root"></div>', {
			url: "https://lab.example/login",
		});
		const cleanup = installDomGlobals(dom);
		const previousFormData = globalThis.FormData;
		globalThis.FormData = dom.window.FormData;
		globalThis.IS_REACT_ACT_ENVIRONMENT = true;
		const calls = [];
		globalThis.replaceDocument = (target) => calls.push(["document", target]);
		globalThis.testRouter = {
			refresh: () => calls.push(["refresh"]),
			replace: (target) => calls.push(["client", target]),
		};
		globalThis.loginResponse = mfa
			? { challengeToken: "challenge", mfaRequired: true }
			: { redirect: "/inbox" };
		const { createElement, act } = await import("react");
		const flush = (action) =>
			act(async () => {
				action();
				await Promise.resolve();
			});
		const { createRoot } = await import("react-dom/client");
		const { LoginClient } = await import(pathToFileURL(outfile).href);
		const root = createRoot(document.querySelector("#root"));
		const returnTo = "/oauth/authorize?client_id=test&state=original";
		try {
			await flush(() => root.render(createElement(LoginClient, { returnTo })));
			await flush(() =>
				document
					.querySelector("form")
					.dispatchEvent(
						new dom.window.Event("submit", { bubbles: true, cancelable: true })
					)
			);
			if (mfa) {
				assert.deepEqual(calls, []);
				assert.ok(document.querySelector("#code"));
				await flush(() =>
					document.querySelector("form").dispatchEvent(
						new dom.window.Event("submit", {
							bubbles: true,
							cancelable: true,
						})
					)
				);
			}
			assert.deepEqual(calls, [["document", returnTo]]);
		} finally {
			await flush(() => root.unmount());
			cleanup();
			dom.window.close();
			globalThis.FormData = previousFormData;
		}
	});
}
