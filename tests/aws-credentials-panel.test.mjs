import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { JSDOM } from "jsdom";

const { mkdtempSync, readFileSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const outDir = mkdtempSync(join(root, "tests", ".tmp-aws-credentials-panel-"));
const outfile = join(outDir, "panel.mjs");
after(() => rmSync(outDir, { force: true, recursive: true }));

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	url: "https://mail.example/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.testDom = dom;

await build({
	alias: { "@": join(root, "src") },
	banner: {
		js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
	},
	bundle: true,
	external: ["react", "react-dom", "react-dom/client", "jsdom"],
	format: "esm",
	loader: { ".js": "jsx" },
	logLevel: "silent",
	outfile,
	platform: "browser",
	plugins: [
		{
			name: "runtime-stubs",
			setup(builder) {
				builder.onLoad({ filter: /\.css$/ }, () => ({
					contents: "",
					loader: "js",
				}));
			},
		},
	],
	stdin: {
		contents: `
			import { createElement } from "react";
			import { createRoot } from "react-dom/client";
			import { act } from "react";
			import { LanguageProvider } from "./src/components/language-provider";
			import Panel from "./src/app/(admin)/domains/aws-credentials-panel";
			import { ApiError, requestJson } from "./src/app/(admin)/domains/api";
			export { ApiError, requestJson };
			const dom = globalThis.testDom;
			export async function renderPanel() {
				// Each test gets its own mount, so panel state never leaks between them.
				document.body.replaceChildren();
				const container = document.createElement("div");
				document.body.appendChild(container);
				const root = createRoot(container);
				await act(async () => {
					root.render(createElement(LanguageProvider, { initialLocale: "en" }, createElement(Panel, { need: "sending" })));
				});
				return async function fillAndSave() {
					const inputs = container.querySelectorAll("input");
					const setValue = (input, value) => {
						const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
						setter.call(input, value);
						input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
					};
					await act(async () => {
						setValue(inputs[0], "AKIAIOSFODNN7EXAMPLE");
						setValue(inputs[1], "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
						setValue(inputs[2], "us-east-1");
					});
					await act(async () => {
						container.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
					});
				};
			}
		`,
		loader: "tsx",
		resolveDir: root,
	},
	target: "es2022",
	tsconfig: join(root, "tsconfig.json"),
});

const { renderPanel, requestJson, ApiError } = await import(
	pathToFileURL(outfile).href
);
const en = JSON.parse(
	readFileSync(join(root, "src/lib/i18n/en.json"), "utf-8")
);
const AWS_IAM_POLICY_SOURCE = readFileSync(
	join(root, "src/lib/aws/validate.ts"),
	"utf-8"
);

/** Answers the panel's calls from a queue of canned responses, recording what it was asked. */
function stubApi(responses) {
	const calls = [];
	globalThis.fetch = (url, init) => {
		try {
			calls.push({ method: init?.method ?? "GET", url: String(url) });
			const next = responses.shift();
			if (!next) {
				throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
			}
			return Promise.resolve(
				Response.json(next.body, { status: next.status ?? 200 })
			);
		} catch (error) {
			return Promise.reject(error);
		}
	};
	return calls;
}

const NOT_CONFIGURED = {
	policy: {
		Statement: [{ Action: ["ses:GetAccount"], Effect: "Allow", Resource: "*" }],
		Version: "2012-10-17",
	},
	status: {
		accessKeyHint: null,
		accountId: null,
		configured: false,
		region: null,
		source: null,
	},
};

const REFUSAL = {
	error:
		"These credentials work but have no SES permissions. Attach the policy shown below.",
	policy: {
		Statement: [
			{
				Action: ["ses:GetAccount", "ses:SendEmail"],
				Effect: "Allow",
				Resource: "*",
			},
		],
		Version: "2012-10-17",
	},
	report: {
		accountId: "123456789012",
		arn: "arn:aws:iam::123456789012:user/mailflare",
		missing: [
			"ses:GetAccount",
			"ses:SendEmail",
			"ses:DescribeActiveReceiptRuleSet",
		],
		productionAccess: null,
		receiving: false,
		receivingRegion: true,
		region: "us-east-1",
		s3: false,
		sending: false,
		sns: false,
	},
};

test("a save the server refuses shows the missing permissions and the IAM policy", async () => {
	stubApi([{ body: NOT_CONFIGURED }, { body: REFUSAL, status: 400 }]);
	const save = await renderPanel();
	await save();

	const details = document.querySelector("body details");
	assert.ok(details, "the missing-permission block is rendered");
	assert.equal(
		details.open,
		true,
		"the block is expanded so the policy is readable without a click"
	);
	assert.match(
		details.textContent,
		/ses:GetAccount, ses:SendEmail, ses:DescribeActiveReceiptRuleSet/u
	);
	assert.match(details.querySelector("pre").textContent, /"ses:SendEmail"/u);
	assert.match(
		document.querySelector("body [role=alert]").textContent,
		/no SES permissions/u
	);
});

test("a refusal body that carries no report leaves the panel as it was", async () => {
	stubApi([
		{ body: NOT_CONFIGURED },
		{
			body: {
				error:
					"AWS rejected these credentials. Check the access key ID and secret.",
			},
			status: 400,
		},
	]);
	const save = await renderPanel();
	await save();

	assert.equal(document.querySelector("body details"), null);
	assert.match(
		document.querySelector("body [role=alert]").textContent,
		/AWS rejected these credentials/u
	);
});

test("a successful save keeps the credentials row and drops the refusal block", async () => {
	const configured = {
		accessKeyHint: "…MPLE",
		accountId: "123456789012",
		configured: true,
		region: "us-east-1",
		source: "settings",
	};
	stubApi([
		{ body: NOT_CONFIGURED },
		{ body: REFUSAL, status: 400 },
		{
			body: {
				report: {
					...REFUSAL.report,
					missing: [],
					productionAccess: true,
					sending: true,
				},
				status: configured,
			},
		},
	]);
	const save = await renderPanel();
	await save();
	assert.ok(document.querySelector("body details"));
	await save();

	assert.equal(
		document.querySelector("body details"),
		null,
		"the refused report is cleared once the credentials save"
	);
	assert.equal(document.querySelector("body [role=alert]"), null);
});

test("the admin API answers a refused save with the policy it tells the admin to attach", () => {
	try {
		const route = readFileSync(
			join(root, "src/app/api/admin/aws/route.ts"),
			"utf-8"
		);
		const refusal = route.slice(
			route.indexOf("!report.sending && !report.receiving")
		);
		assert.match(
			refusal,
			/policy: AWS_IAM_POLICY/u,
			"the 400 body carries the policy"
		);
		assert.match(
			AWS_IAM_POLICY_SOURCE,
			/export const AWS_IAM_POLICY = \{/u,
			"the policy the route sends is the one validate.ts defines"
		);

		return Promise.resolve();
	} catch (error) {
		return Promise.reject(error);
	}
});

test("requestJson keeps the parsed body on a rejected response", async () => {
	stubApi([{ body: { error: "nope", report: REFUSAL.report }, status: 400 }]);
	const error = await requestJson("/api/admin/aws", "PUT", {}).then(
		() => null,
		(error_) => error_
	);

	assert.ok(error instanceof ApiError);
	assert.equal(error.message, "nope");
	assert.deepEqual(error.data.report, REFUSAL.report);
	assert.equal(typeof en["aws.missingSummary"], "string");
});
