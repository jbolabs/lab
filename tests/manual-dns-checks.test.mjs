import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const bundleDirectory = mkdtempSync(
	join(root, "node_modules", "mailflare-dns-bundle-")
);
await build({
	alias: { "cloudflare:workers": "./server/runtime/cloudflare-workers.ts" },
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(bundleDirectory, "entry.mjs"),
	packages: "external",
	platform: "node",
	stdin: {
		contents: `
			export { hasMx } from "./src/lib/domains/receiving-dns.ts";
			export { auditDomainDns } from "./src/lib/domains/dns-audit.ts";
			export { preflightDomain } from "./src/lib/domains/preflight.ts";
			export { hasConflictingMxRecords } from "./src/lib/domains/mx-records.ts";
		`,
		resolveDir: root,
		sourcefile: "dns-test-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const { auditDomainDns, hasConflictingMxRecords, hasMx, preflightDomain } =
	await import(pathToFileURL(join(bundleDirectory, "entry.mjs")).href);
rmSync(bundleDirectory, { force: true, recursive: true });

const manualDomain = { hostname: "example.com", zoneId: "manual" };

function answerDns(answers) {
	const asked = [];
	globalThis.fetch = (url) => {
		try {
			const parsed = new URL(url);
			const name = parsed.searchParams.get("name");
			asked.push(name);
			const data = answers[`${name}|${parsed.searchParams.get("type")}`];
			return Promise.resolve(
				Response.json(
					data === undefined
						? { Status: 3 }
						: {
								Answer: data.map((value) => ({
									TTL: 60,
									data: value,
									name,
									type: 0,
								})),
								Status: 0,
							}
				)
			);
		} catch (error) {
			return Promise.reject(error);
		}
	};
	return asked;
}

test("a manual zone's MX is read from public DNS", async () => {
	answerDns({
		"example.com|MX": ["10 inbound-smtp.ap-northeast-1.amazonaws.com."],
	});
	assert.equal(
		await hasMx({}, manualDomain, "inbound-smtp.ap-northeast-1.amazonaws.com"),
		true
	);
	assert.equal(await hasMx({}, manualDomain, "mail.example.net"), false);
});

test("a manual zone with no MX answers false, and a failed lookup stays unknown", async () => {
	answerDns({});
	assert.equal(await hasMx({}, manualDomain, "mail.example.net"), false);
	globalThis.fetch = () => {
		try {
			throw new Error("offline");
		} catch (error) {
			return Promise.reject(error);
		}
	};
	assert.equal(await hasMx({}, manualDomain, "mail.example.net"), null);
});

test("DKIM for a Resend domain is checked at Resend's selector when nothing else names one", async () => {
	const asked = answerDns({ "resend._domainkey.example.com|TXT": ["p=abc"] });
	const view = { routing: { missing: [], records: [] }, sending: [] };
	const resend = await auditDomainDns("example.com", view, "resend");
	assert.equal(resend.dkim.status, "ok");
	assert.ok(asked.includes("resend._domainkey.example.com"));
	const other = await auditDomainDns("example.com", view, "none");
	assert.equal(other.dkim.status, "unknown");
});

test("setup checks a domain without Cloudflare credentials as a manual zone", async () => {
	globalThis.fetch = () => {
		throw new Error("no Cloudflare API call expected");
	};
	const domain = await preflightDomain(
		{ MAILFLARE_RUNTIME: "node" },
		" Lab.Test "
	);
	assert.deepEqual(domain, {
		hostname: "lab.test",
		zone: { id: "manual", name: "lab.test" },
	});
	assert.equal(
		await hasConflictingMxRecords({}, domain.zone.id, domain.hostname),
		false
	);
});
