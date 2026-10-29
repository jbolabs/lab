import assert from "node:assert/strict";
import { generateKeyPairSync, createPublicKey, sign, verify } from "node:crypto";
import test from "node:test";
import { Redacted } from "../node_modules/effect/dist/index.js";
import { vapidPublicKey, vapidPrivateKey } from "../push-keys.ts";

test("persisted Alchemy P-256 keys convert to a matching Web Push key pair without exposing the private key", () => {
 const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1", publicKeyEncoding: { format: "pem", type: "spki" }, privateKeyEncoding: { format: "pem", type: "pkcs8" } });
 const publicBytes = Buffer.from(vapidPublicKey(keys.publicKey), "base64url");
 const privateKey = vapidPrivateKey(Redacted.make(keys.privateKey));
 assert.equal(publicBytes.length, 65);
 assert.equal(publicBytes[0], 4);
 assert.equal(Buffer.from(Redacted.value(privateKey), "base64url").length, 32);
 assert.equal(Redacted.isRedacted(privateKey), true);
 const jwk = { kty: "EC", crv: "P-256", x: publicBytes.subarray(1, 33).toString("base64url"), y: publicBytes.subarray(33).toString("base64url") };
 assert.equal(verify("sha256", Buffer.from("push"), createPublicKey({ key: jwk, format: "jwk" }), sign("sha256", Buffer.from("push"), { key: { ...jwk, d: Redacted.value(privateKey) }, format: "jwk" })), true);
 assert.equal(vapidPublicKey(keys.publicKey), vapidPublicKey(keys.publicKey));
});

test("non-P-256 keys are rejected", () => {
 const keys = generateKeyPairSync("ec", { namedCurve: "secp384r1", publicKeyEncoding: { format: "pem", type: "spki" }, privateKeyEncoding: { format: "pem", type: "pkcs8" } });
 assert.throws(() => vapidPublicKey(keys.publicKey), /P-256/);
 assert.throws(() => vapidPrivateKey(Redacted.make(keys.privateKey)), /P-256/);
});
