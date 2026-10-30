import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { JSDOM } from "jsdom";

import { deferredPromise } from "./helpers/deferred.mjs";
import { installDomGlobals } from "./helpers/dom.mjs";

const entry = () =>
	[...document.querySelectorAll("[role=menuitem]")].find(
		(element) => element.textContent === "New document"
	);
const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const project = join(import.meta.dirname, "..");
const directory = mkdtempSync(
	join(project, "node_modules", "drive-editor-test-")
);
after(() => rmSync(directory, { force: true, recursive: true }));
await build({
	bundle: true,
	format: "esm",
	jsx: "automatic",
	logLevel: "silent",
	outfile: join(directory, "editor.mjs"),
	packages: "external",
	platform: "node",
	plugins: [
		{
			name: "navigation-boundaries",
			setup(builder) {
				builder.onResolve(
					{
						filter:
							/^(?:@\/lib\/navigation|@\/components\/app-link|@\/hooks\/use-current-user)$/,
					},
					(args) => ({ namespace: "fixture", path: args.path })
				);
				builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
					contents: (() => {
						if (args.path === "@/lib/navigation") {
							return "export function usePathname(){return '/drive'} export function useRouter(){return {}} export function useSearchParams(){return new URLSearchParams(globalThis.window?.location.search ?? '')}";
						}
						if (args.path === "@/components/app-link") {
							return "import {createElement} from 'react';export default function Link(props){return createElement('a',props)}";
						}
						return "export function useCurrentUser(){return {id:'user'}}";
					})(),
					loader: "js",
					resolveDir: project,
				}));
			},
		},
	],
	stdin: {
		contents:
			'export { default } from "./src/app/(drive)/drive/document/page.tsx"; export { DriveNav } from "./src/app/(drive)/drive-nav.tsx"; export { DRIVE_LOCATION_EVENT } from "./src/app/(drive)/drive-events.ts";',
		resolveDir: project,
	},
	tsconfig: join(project, "tsconfig.json"),
});

test("a save completing after navigation preserves a newer draft and does not rewrite the route", async () => {
	const dom = new JSDOM("<!doctype html><div id='root'></div>", {
		url: "https://mail.example/drive/document?id=document",
	});
	installDomGlobals(dom);
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	const { createElement, act } = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { default: Editor } = await import(
		pathToFileURL(join(directory, "editor.mjs")).href
	);
	const item = { id: "document", name: "Notes.md", role: "owner" };
	let persisted = "Original";
	let resolveSave;
	globalThis.fetch = (_url, init) =>
		Promise.resolve(
			init?.method === "PUT"
				? deferredPromise((resolve) => {
						resolveSave = () => {
							persisted = "First unsaved";
							resolve(Response.json({ item, revision: "second" }));
						};
					})
				: Response.json({
						content: persisted,
						item,
						revision: persisted === "Original" ? "first" : "second",
					})
		);
	const root = createRoot(document.querySelector("#root"));
	const mount = () =>
		act(() => {
			try {
				root.render(createElement(Editor));

				return Promise.resolve();
			} catch (error) {
				return Promise.reject(error);
			}
		});
	const leave = () =>
		act(() => {
			try {
				root.render(null);
				window.history.replaceState(null, "", "/drive");

				return Promise.resolve();
			} catch (error) {
				return Promise.reject(error);
			}
		});
	const input = (value) =>
		act(() => {
			try {
				const textarea = document.querySelector("textarea");
				Object.getOwnPropertyDescriptor(
					dom.window.HTMLTextAreaElement.prototype,
					"value"
				).set.call(textarea, value);
				textarea.dispatchEvent(
					new dom.window.Event("input", { bubbles: true })
				);

				return Promise.resolve();
			} catch (error) {
				return Promise.reject(error);
			}
		});
	try {
		await mount();
		await input("First unsaved");
		await act(() => {
			try {
				[...document.querySelectorAll("button")]
					.find((button) => button.textContent === "Save")
					.click();

				return Promise.resolve();
			} catch (error) {
				return Promise.reject(error);
			}
		});
		assert.equal(typeof resolveSave, "function");
		await leave();
		window.history.replaceState(null, "", "/drive/document?id=document");
		await mount();
		await input("Second unsaved");
		await leave();
		await act(() => Promise.resolve(resolveSave()));
		assert.equal(window.location.pathname, "/drive");
		window.history.replaceState(null, "", "/drive/document?id=document");
		await mount();
		assert.equal(document.querySelector("textarea").value, "Second unsaved");
		assert.match(document.body.textContent, /Unsaved changes/u);
	} finally {
		await act(() => Promise.resolve(root.unmount()));
		dom.window.close();
		delete globalThis.window;
		delete globalThis.document;
		delete globalThis.localStorage;
		delete globalThis.IS_REACT_ACT_ENVIRONMENT;
		delete globalThis.fetch;
	}
});

async function mountEditor(id, fetch) {
	const dom = new JSDOM("<!doctype html><div id='root'></div>", {
		url: `https://mail.example/drive/document?id=${id}`,
	});
	installDomGlobals(dom);
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.fetch = fetch;
	const NodeEvent = globalThis.Event;
	globalThis.Event = dom.window.Event;
	const { createElement, act } = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { default: Editor } = await import(
		pathToFileURL(join(directory, "editor.mjs")).href
	);
	const root = createRoot(document.querySelector("#root"));
	await act(() => {
		try {
			root.render(createElement(Editor));

			return Promise.resolve();
		} catch (error) {
			return Promise.reject(error);
		}
	});
	const close = async () => {
		await act(() => Promise.resolve(root.unmount()));
		dom.window.close();
		delete globalThis.window;
		delete globalThis.document;
		delete globalThis.localStorage;
		delete globalThis.IS_REACT_ACT_ENVIRONMENT;
		delete globalThis.fetch;
		globalThis.Event = NodeEvent;
	};
	return { act, close, dom };
}

test("Ctrl+S saves only changed text, against the loaded revision", async () => {
	const puts = [];
	const { dom, act, close } = await mountEditor("keyboard", (_url, init) => {
		try {
			if (init?.method === "PUT") {
				puts.push(JSON.parse(init.body));
				return Promise.resolve(
					Response.json({
						item: { id: "keyboard", name: "Keys.md", role: "owner" },
						revision: "r2",
					})
				);
			}
			return Promise.resolve(
				Response.json({
					content: "Saved",
					item: {
						id: "keyboard",
						name: "Keys.md",
						parentId: null,
						role: "owner",
					},
					revision: "r1",
				})
			);
		} catch (error) {
			return Promise.reject(error);
		}
	});
	const press = () =>
		act(() => {
			try {
				document.querySelector("textarea").dispatchEvent(
					new dom.window.KeyboardEvent("keydown", {
						bubbles: true,
						cancelable: true,
						ctrlKey: true,
						key: "s",
					})
				);

				return Promise.resolve();
			} catch (error) {
				return Promise.reject(error);
			}
		});
	try {
		await press();
		assert.equal(puts.length, 0);
		await act(() => {
			try {
				const textarea = document.querySelector("textarea");
				Object.getOwnPropertyDescriptor(
					dom.window.HTMLTextAreaElement.prototype,
					"value"
				).set.call(textarea, "Edited");
				textarea.dispatchEvent(
					new dom.window.Event("input", { bubbles: true })
				);

				return Promise.resolve();
			} catch (error) {
				return Promise.reject(error);
			}
		});
		await press();
		await act(async () => {
			await deferredPromise((resolve) => {
				setTimeout(resolve, 0);
			});
		});
		assert.deepEqual(puts, [{ content: "Edited", expectedRevision: "r1" }]);
		assert.equal(
			document.querySelector("[role=alert]")?.textContent,
			undefined
		);
		assert.match(
			document.querySelector("[role=status], output").textContent,
			/^Saved$/u
		);
	} finally {
		await close();
	}
});

test("a view-only document opens rendered, with no editor or Save", async () => {
	const { close } = await mountEditor("viewer", () =>
		Promise.resolve(
			Response.json({
				content: "# Shared heading",
				item: {
					id: "viewer",
					name: "Shared.md",
					parentId: "folder",
					role: "view",
				},
				revision: "r1",
			})
		)
	);
	try {
		assert.equal(document.querySelector("h1")?.textContent, "Shared.md");
		assert.equal(
			document.querySelector("article h1")?.textContent,
			"Shared heading"
		);
		assert.equal(document.querySelector("textarea"), null);
		assert.equal(
			[...document.querySelectorAll("button")].some(
				(button) => button.textContent === "Save"
			),
			false
		);
		assert.equal(
			document
				.querySelector('a[aria-label="Back to Drive"]')
				.getAttribute("href"),
			"/drive?view=shared"
		);
	} finally {
		await close();
	}
});

test("New document stays disabled until the current folder has write access", async () => {
	const dom = new JSDOM("<!doctype html><div id='root'></div>", {
		url: "https://mail.example/drive?folder=shared",
	});
	const names = [
		"window",
		"document",
		"location",
		"localStorage",
		"HTMLElement",
		"Element",
		"Node",
		"Event",
		"CustomEvent",
		"MutationObserver",
		"getComputedStyle",
	];
	const previous = new Map(names.map((name) => [name, globalThis[name]]));
	for (const name of names) {
		globalThis[name] = (() => {
			if (name === "getComputedStyle") {
				return dom.window.getComputedStyle.bind(dom.window);
			}
			if (name === "window") {
				return dom.window;
			}
			return dom.window[name];
		})();
	}
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	const { createElement, act } = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { DriveNav, DRIVE_LOCATION_EVENT } = await import(
		pathToFileURL(join(directory, "editor.mjs")).href
	);
	const root = createRoot(document.querySelector("#root"));
	const access = (canWrite) =>
		act(() =>
			Promise.resolve(
				window.dispatchEvent(
					new dom.window.CustomEvent(DRIVE_LOCATION_EVENT, {
						detail: { canWrite, folderId: "shared" },
					})
				)
			)
		);
	try {
		await act(() => Promise.resolve(root.render(createElement(DriveNav))));
		// A click opens a Base UI menu synchronously; a pointer mousedown waits a frame.
		await act(() =>
			Promise.resolve(
				document.querySelector('button[aria-label="New"]').click()
			)
		);

		assert.ok(entry(), "creation menu is open");
		assert.equal(entry().getAttribute("aria-disabled"), "true");
		assert.equal(entry().hasAttribute("href"), false);
		await access(false);
		assert.equal(entry().getAttribute("aria-disabled"), "true");
		assert.equal(entry().hasAttribute("href"), false);
		await access(true);
		assert.equal(entry().getAttribute("href"), "/drive/document?parent=shared");
		assert.notEqual(entry().getAttribute("aria-disabled"), "true");
		await access(false);
		assert.equal(entry().getAttribute("aria-disabled"), "true");
		assert.equal(entry().hasAttribute("href"), false);
	} finally {
		await act(async () => {
			root.unmount();
			await deferredPromise((resolve) => {
				setTimeout(resolve, 0);
			});
		});
		dom.window.close();
		for (const name of names) {
			if (previous.get(name) === undefined) {
				Reflect.deleteProperty(globalThis, name);
			} else {
				globalThis[name] = previous.get(name);
			}
		}
		delete globalThis.IS_REACT_ACT_ENVIRONMENT;
	}
});
