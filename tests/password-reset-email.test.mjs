import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, readFileSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const bundleDirectory = mkdtempSync(
	join(root, "node_modules", "mailflare-reset-bundle-")
);
await build({
	bundle: true,
	format: "esm",
	loader: { ".json": "json" },
	logLevel: "silent",
	outfile: join(bundleDirectory, "entry.mjs"),
	packages: "external",
	platform: "node",
	stdin: {
		contents: `
			export { buildPasswordResetEmail } from "./src/lib/auth/password-reset-utils.ts";
			export { createTranslator } from "./src/lib/i18n/utils.ts";
		`,
		resolveDir: root,
		sourcefile: "reset-test-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { buildPasswordResetEmail, createTranslator } = await import(
	pathToFileURL(join(bundleDirectory, "entry.mjs")).href
);
rmSync(bundleDirectory, { force: true, recursive: true });

const turkish = JSON.parse(
	readFileSync(join(root, "public", "locales", "tr.json"), "utf-8")
);
const input = {
	appName: "Posta",
	email: "ada@example.com",
	link: "https://mail.example.com/reset-password?token=abc&x=1",
	minutes: 30,
};

test("the reset mail is in English by default", () => {
	const mail = buildPasswordResetEmail(createTranslator("en"), input);
	assert.equal(mail.subject, "Reset your Posta password");
	assert.match(
		mail.text,
		/Someone asked to reset the password for ada@example.com on Posta\./u
	);
	assert.match(mail.text, /within 30 minutes/u);
	assert.match(mail.text, /If that was not you/u);
});

test("the reset mail follows the chosen language", () => {
	const mail = buildPasswordResetEmail(createTranslator("tr", turkish), input);
	assert.equal(mail.subject, "Posta parolanızı sıfırlayın");
	assert.match(mail.text, /30 dakika içinde/u);
	assert.match(mail.text, /parolanız olduğu gibi kalır/u);
	assert.ok(!/Someone asked|If that was not you/u.test(mail.text + mail.html));
});

test("the link is never translated or altered", () => {
	for (const t of [createTranslator("en"), createTranslator("tr", turkish)]) {
		const mail = buildPasswordResetEmail(t, input);
		assert.ok(mail.text.includes(input.link));
		assert.ok(
			mail.html.includes(
				"https://mail.example.com/reset-password?token=abc&amp;x=1"
			)
		);
	}
});

test("addresses and names are escaped in the HTML part only", () => {
	const mail = buildPasswordResetEmail(createTranslator("en"), {
		...input,
		appName: "R&D <Mail>",
		email: "a<b>@example.com",
	});
	assert.ok(mail.html.includes("<b>a&lt;b&gt;@example.com</b>"));
	assert.ok(mail.html.includes("R&amp;D &lt;Mail&gt;"));
	assert.ok(!mail.html.includes("<Mail>"));
	assert.ok(mail.text.includes("a<b>@example.com"));
	assert.ok(mail.text.includes("R&D <Mail>"));
});

test("a language without the new strings falls back to English", () => {
	const mail = buildPasswordResetEmail(createTranslator("de", {}), input);
	assert.equal(mail.subject, "Reset your Posta password");
});
