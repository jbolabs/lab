import assert from "node:assert/strict";
import {
	generateKeyPairSync,
	createPublicKey,
	sign,
	verify,
} from "node:crypto";
import test from "node:test";

import { Redacted } from "../node_modules/effect/dist/index.js";
import { vapidPublicKey, vapidPrivateKey } from "../push-keys.ts";

test("persisted Alchemy P-256 keys convert to a matching Web Push key pair without exposing the private key", () => {
	const keys = generateKeyPairSync("ec", {
		namedCurve: "prime256v1",
		privateKeyEncoding: { format: "pem", type: "pkcs8" },
		publicKeyEncoding: { format: "pem", type: "spki" },
	});
	const publicBytes = Buffer.from(vapidPublicKey(keys.publicKey), "base64url");
	const privateKey = vapidPrivateKey(Redacted.make(keys.privateKey));
	assert.equal(publicBytes.length, 65);
	assert.equal(publicBytes[0], 4);
	assert.equal(Buffer.from(Redacted.value(privateKey), "base64url").length, 32);
	assert.equal(Redacted.isRedacted(privateKey), true);
	const jwk = {
		crv: "P-256",
		kty: "EC",
		x: publicBytes.subarray(1, 33).toString("base64url"),
		y: publicBytes.subarray(33).toString("base64url"),
	};
	assert.equal(
		verify(
			"sha256",
			Buffer.from("push"),
			createPublicKey({ format: "jwk", key: jwk }),
			sign("sha256", Buffer.from("push"), {
				format: "jwk",
				key: { ...jwk, d: Redacted.value(privateKey) },
			})
		),
		true
	);
	assert.equal(vapidPublicKey(keys.publicKey), vapidPublicKey(keys.publicKey));
});

test("non-P-256 keys are rejected", () => {
	const keys = generateKeyPairSync("ec", {
		namedCurve: "secp384r1",
		privateKeyEncoding: { format: "pem", type: "pkcs8" },
		publicKeyEncoding: { format: "pem", type: "spki" },
	});
	assert.throws(() => vapidPublicKey(keys.publicKey), /P-256/u);
	assert.throws(
		() => vapidPrivateKey(Redacted.make(keys.privateKey)),
		/P-256/u
	);
});
