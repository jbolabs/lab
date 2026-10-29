import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const root = nodePath.join(import.meta.dirname, "..");
const outDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "mailflare-brand-"));
after(() => fs.rmSync(outDir, { force: true, recursive: true }));

const outfile = nodePath.join(outDir, "brand-logo-utils.mjs");
await build({
	alias: { "@": nodePath.join(root, "src") },
	bundle: true,
	entryPoints: [nodePath.join(root, "src/lib/contacts/brand-logo-utils.ts")],
	format: "esm",
	logLevel: "silent",
	outfile,
	platform: "node",
});
const {
	getBrandLogoDomain,
	getBrandLogoUrl,
	getOrganizationalDomain,
	getPngWidth,
	parseBimiLogoUrl,
} = await import(pathToFileURL(outfile).href);

test("company senders get a logo lookup by their own domain", () => {
	assert.equal(
		getBrandLogoDomain("PayPal <service@Mail.PayPal.com>"),
		"mail.paypal.com"
	);
	assert.equal(
		getBrandLogoUrl("noreply@github.com"),
		"/api/contacts/brand-logo?domain=github.com"
	);
});

test("personal mail providers and junk addresses show initials", () => {
	for (const address of [
		"Jane <jane@gmail.com>",
		"someone@icloud.com",
		"x@abc123.privaterelay.appleid.com",
		"not an address",
		"a@localhost",
	]) {
		assert.equal(getBrandLogoDomain(address), null, address);
	}
});

test("organisational domain keeps country registries", () => {
	assert.equal(getOrganizationalDomain("email.uber.com"), "uber.com");
	assert.equal(getOrganizationalDomain("mail.bbc.co.uk"), "bbc.co.uk");
	assert.equal(getOrganizationalDomain("github.com"), "github.com");
	assert.equal(getOrganizationalDomain("news.example.de"), "example.de");
});

test("BIMI records yield their HTTPS logo only", () => {
	assert.equal(
		parseBimiLogoUrl(
			"v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem"
		),
		"https://example.com/logo.svg"
	);
	assert.equal(
		parseBimiLogoUrl("v=BIMI1; l=http://example.com/logo.svg"),
		null
	);
	assert.equal(parseBimiLogoUrl("v=BIMI1; l=;"), null);
	assert.equal(parseBimiLogoUrl("v=spf1 -all"), null);
});

test("PNG width is read from the header", () => {
	const png = new Uint8Array(24);
	png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	new DataView(png.buffer).setUint32(16, 180);
	assert.equal(getPngWidth(png), 180);
	assert.equal(getPngWidth(new Uint8Array(24)), null);
});
