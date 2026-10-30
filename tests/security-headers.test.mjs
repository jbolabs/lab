import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { tmpdir } = os;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const outDir = mkdtempSync(join(tmpdir(), "mailflare-security-headers-test-"));
after(() => rmSync(outDir, { force: true, recursive: true }));
const outfile = join(outDir, "headers.mjs");
await build({
	bundle: true,
	entryPoints: [join(root, "src/lib/security/headers.ts")],
	format: "esm",
	logLevel: "silent",
	outfile,
	platform: "node",
});
const { getSecurityHeaders, withoutHttpsUpgradeOnHttp, withSecurityHeaders } =
	await import(pathToFileURL(outfile).href);

const csp = getSecurityHeaders().find(
	(header) => header.key === "Content-Security-Policy"
).value;
const page = () =>
	new Response("<html></html>", {
		headers: { "Content-Security-Policy": csp, "Content-Type": "text/html" },
		status: 200,
	});

test("https keeps upgrade-insecure-requests, so http images in mail still load", () => {
	const response = withoutHttpsUpgradeOnHttp(
		new Request("https://mail.example.com/inbox"),
		page()
	);
	assert.match(
		response.headers.get("Content-Security-Policy"),
		/upgrade-insecure-requests/u
	);
});

test("plain http drops only upgrade-insecure-requests, so a local server's assets load", async () => {
	const response = withoutHttpsUpgradeOnHttp(
		new Request("http://192.168.1.20:3000/inbox"),
		page()
	);
	const policy = response.headers.get("Content-Security-Policy");
	assert.doesNotMatch(policy, /upgrade-insecure-requests/u);
	assert.match(policy, /default-src 'self'/u);
	assert.equal(response.headers.get("Content-Type"), "text/html");
	assert.equal(await response.text(), "<html></html>");
});

test("runtime policy preserves response streams, endpoint headers and separate login cookies", async () => {
	const original = new Response("streamed content", {
		headers: { "Content-Type": "text/plain", "Referrer-Policy": "no-referrer" },
	});
	original.headers.append("Set-Cookie", "ep_session=one; HttpOnly; Path=/");
	original.headers.append("Set-Cookie", "ep_accounts=two; HttpOnly; Path=/");
	const response = withSecurityHeaders(
		new Request("https://lab.example.test/"),
		original
	);
	assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
	assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
	assert.equal(response.headers.getSetCookie().length, 2);
	assert.equal(await response.text(), "streamed content");
});

test("runtime policy can wrap immutable redirect responses", () => {
	const response = withSecurityHeaders(
		new Request("http://localhost/login"),
		Response.redirect("http://localhost/inbox", 307)
	);
	assert.equal(response.status, 307);
	assert.equal(response.headers.get("Location"), "http://localhost/inbox");
	assert.doesNotMatch(
		response.headers.get("Content-Security-Policy"),
		/upgrade-insecure-requests/u
	);
});
