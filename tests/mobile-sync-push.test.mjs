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
const outDir = mkdtempSync(join(tmpdir(), "mailflare-mobile-"));
after(() => rmSync(outDir, { force: true, recursive: true }));

async function bundle(entry, outfile) {
	await build({
		alias: { "@": join(root, "src") },
		bundle: true,
		entryPoints: [join(root, entry)],
		format: "esm",
		logLevel: "silent",
		outfile: join(outDir, outfile),
		platform: "node",
		target: "node22",
	});
	return import(pathToFileURL(join(outDir, outfile)).href);
}

const changes = await bundle(
	"src/lib/jmap/changes-utils.ts",
	"changes-utils.mjs"
);
const push = await bundle("src/lib/push/native-crypto.ts", "native-crypto.mjs");

test("JMAP states round-trip and reject other formats", () => {
	assert.deepEqual(changes.parseState(changes.formatState(42, "abcd")), {
		fingerprint: "abcd",
		seq: 42,
	});
	assert.equal(changes.parseState('[["mbx","full_access"]]'), null);
	assert.equal(changes.parseState("c1:-1:abcd"), null);
	assert.equal(changes.parseState(null), null);
});

test("change rows coalesce into JMAP created/updated/destroyed", () => {
	const result = changes.coalesceChanges([
		{ change: "created", id: "a" },
		{ change: "updated", id: "a" },
		{ change: "updated", id: "b" },
		{ change: "created", id: "c" },
		{ change: "destroyed", id: "c" },
		{ change: "updated", id: "d" },
		{ change: "destroyed", id: "d" },
		{ change: "destroyed", id: "e" },
		{ change: "created", id: "e" },
	]);
	assert.deepEqual(result.created, ["a"]);
	assert.deepEqual(result.updated.toSorted(), ["b", "e"]);
	assert.deepEqual(result.destroyed, ["d"]);
});

test("push previews decrypt with the device key (ECDH + HKDF + AES-GCM)", async () => {
	const device = await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"]
	);
	const publicKey = push.toBase64(
		new Uint8Array(await crypto.subtle.exportKey("raw", device.publicKey))
	);
	assert.equal(push.isValidDevicePublicKey(publicKey), true);
	assert.equal(push.isValidDevicePublicKey("AAAA"), false);

	const message = JSON.stringify({ from: "ann@x.com", subject: "Hello" });
	const enc = await push.encryptPreview(
		publicKey,
		new TextEncoder().encode(message)
	);

	const ephemeral = await crypto.subtle.importKey(
		"raw",
		push.fromBase64(enc.epk),
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		[]
	);
	const shared = await crypto.subtle.deriveBits(
		{ name: "ECDH", public: ephemeral },
		device.privateKey,
		256
	);
	const hkdf = await crypto.subtle.importKey("raw", shared, "HKDF", false, [
		"deriveKey",
	]);
	const key = await crypto.subtle.deriveKey(
		{
			hash: "SHA-256",
			info: new TextEncoder().encode(push.PUSH_HKDF_INFO),
			name: "HKDF",
			salt: push.fromBase64(enc.salt),
		},
		hkdf,
		{ length: 256, name: "AES-GCM" },
		false,
		["decrypt"]
	);
	const plain = await crypto.subtle.decrypt(
		{ iv: push.fromBase64(enc.iv), name: "AES-GCM" },
		key,
		push.fromBase64(enc.ct)
	);
	assert.equal(new TextDecoder().decode(plain), message);
});

test("APNs provider tokens are verifiable ES256 JWTs", async () => {
	const pair = await crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"]
	);
	const pkcs8 = new Uint8Array(
		await crypto.subtle.exportKey("pkcs8", pair.privateKey)
	);
	const pem = `-----BEGIN PRIVATE KEY-----\n${push.toBase64(pkcs8)}\n-----END PRIVATE KEY-----`;
	const jwt = await push.signApnsJwt(
		await push.importApnsKey(pem),
		"KEY123",
		"TEAM456",
		1_700_000_000
	);
	const [header, claims, signature] = jwt.split(".");
	assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), {
		alg: "ES256",
		kid: "KEY123",
	});
	assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url").toString()), {
		iat: 1_700_000_000,
		iss: "TEAM456",
	});
	const valid = await crypto.subtle.verify(
		{ hash: "SHA-256", name: "ECDSA" },
		pair.publicKey,
		Buffer.from(signature, "base64url"),
		new TextEncoder().encode(`${header}.${claims}`)
	);
	assert.equal(valid, true);
});
