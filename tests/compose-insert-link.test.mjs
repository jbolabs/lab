import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { JSDOM } from "jsdom";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const outDir = mkdtempSync(join(root, "tests", ".tmp-compose-insert-link-"));
after(() => rmSync(outDir, { force: true, recursive: true }));

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	url: "https://mail.example/",
});
for (const key of [
	"window",
	"document",
	"HTMLElement",
	"HTMLInputElement",
	"Element",
	"Node",
	"Event",
]) {
	globalThis[key] = key === "window" ? dom.window : dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
document.queryCommandState = () => false;
document.queryCommandValue = () => "";

await build({
	alias: { "@": join(root, "src") },
	bundle: true,
	entryPoints: [join(root, "src/components/compose/rich-text-editor.tsx")],
	external: ["react", "react-dom", "react-dom/*"],
	format: "esm",
	logLevel: "silent",
	outfile: join(outDir, "editor.mjs"),
	platform: "browser",
});

const { createElement, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { RichTextEditor } = await import(
	pathToFileURL(join(outDir, "editor.mjs")).href
);

async function setup(t, selected = false) {
	const container = document.createElement("div");
	document.body.append(container);
	const reactRoot = createRoot(container);
	t.after(async () => {
		await act(() => Promise.resolve(reactRoot.unmount()));
		container.remove();
	});
	let submits = 0;
	const commands = [];
	document.execCommand = (command, _showUi, value) => {
		commands.push({
			command,
			selection: window.getSelection().toString(),
			value,
		});
		return true;
	};
	await act(() => {
		try {
			reactRoot.render(
				createElement(
					"form",
					{
						onSubmit(event) {
							event.preventDefault();
							submits += 1;
						},
					},
					createElement(RichTextEditor, { onChange() {}, value: "Read this" })
				)
			);

			return Promise.resolve();
		} catch (error) {
			return Promise.reject(error);
		}
	});
	const editor = container.querySelector('[role="textbox"]');
	editor.focus();
	const range = document.createRange();
	range.setStart(editor.firstChild, selected ? 0 : 9);
	range.setEnd(editor.firstChild, 9);
	window.getSelection().removeAllRanges();
	window.getSelection().addRange(range);
	await act(() =>
		Promise.resolve(
			container.querySelector('[aria-label="Insert link"]').click()
		)
	);
	const input = container.querySelector(
		'input[placeholder="https://example.com"]'
	);
	assert.ok(input);
	assert.equal(
		container.querySelectorAll("form").length,
		1,
		"the popup must not nest a form inside the composer"
	);
	return {
		async apply(key) {
			let event;
			await act(() => {
				try {
					if (key) {
						event = new dom.window.KeyboardEvent("keydown", {
							bubbles: true,
							cancelable: true,
							key,
						});
						input.dispatchEvent(event);
					} else {
						[...container.querySelectorAll("button")]
							.find((button) => button.textContent === "Apply")
							.click();
					}

					return Promise.resolve();
				} catch (error) {
					return Promise.reject(error);
				}
			});
			assert.equal(submits, 0, "inserting a link must not submit the composer");
			assert.equal(
				container.querySelector('input[placeholder="https://example.com"]'),
				null,
				"the popup closes"
			);
			return event;
		},
		commands,
		async fill(value) {
			await act(() => {
				try {
					Object.getOwnPropertyDescriptor(
						dom.window.HTMLInputElement.prototype,
						"value"
					).set.call(input, value);
					input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

					return Promise.resolve();
				} catch (error) {
					return Promise.reject(error);
				}
			});
		},
	};
}

test("Apply inserts a URL at the caret without submitting the compose form", async (t) => {
	const popup = await setup(t);
	await popup.fill(" example.com ");
	await popup.apply();
	assert.deepEqual(popup.commands, [
		{
			command: "insertHTML",
			selection: "",
			value: '<a href="https://example.com">https://example.com</a>',
		},
	]);
});

test("Enter links the saved text selection and prevents implicit form submission", async (t) => {
	const popup = await setup(t, true);
	await popup.fill("https://example.com/read");
	const event = await popup.apply("Enter");
	assert.equal(event.defaultPrevented, true);
	assert.deepEqual(popup.commands, [
		{
			command: "createLink",
			selection: "Read this",
			value: "https://example.com/read",
		},
	]);
});

test("Apply with a blank URL closes the popup without inserting or submitting", async (t) => {
	const popup = await setup(t);
	await popup.fill("   ");
	await popup.apply();
	assert.deepEqual(popup.commands, []);
});

test("Escape cancels link insertion", async (t) => {
	const popup = await setup(t);
	await popup.fill("https://example.com");
	await popup.apply("Escape");
	assert.deepEqual(popup.commands, []);
});
