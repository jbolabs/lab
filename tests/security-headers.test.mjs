import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "mailflare-security-headers-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const outfile = join(outDir, "headers.mjs");
await build({ entryPoints: [join(root, "src/lib/security/headers.ts")], outfile, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
const { getSecurityHeaders, withoutHttpsUpgradeOnHttp } = await import(pathToFileURL(outfile).href);

const csp = getSecurityHeaders().find((header) => header.key === "Content-Security-Policy").value;
const page = () => new Response("<html></html>", { status: 200, headers: { "Content-Security-Policy": csp, "Content-Type": "text/html" } });

test("https keeps upgrade-insecure-requests, so http images in mail still load", () => {
	const response = withoutHttpsUpgradeOnHttp(new Request("https://mail.example.com/inbox"), page());
	assert.match(response.headers.get("Content-Security-Policy"), /upgrade-insecure-requests/);
});

test("plain http drops only upgrade-insecure-requests, so a local server's assets load", async () => {
	const response = withoutHttpsUpgradeOnHttp(new Request("http://192.168.1.20:3000/inbox"), page());
	const policy = response.headers.get("Content-Security-Policy");
	assert.doesNotMatch(policy, /upgrade-insecure-requests/);
	assert.match(policy, /default-src 'self'/);
	assert.equal(response.headers.get("Content-Type"), "text/html");
	assert.equal(await response.text(), "<html></html>");
});
