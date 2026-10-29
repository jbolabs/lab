import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { importApnsKey } from "../src/lib/push/native-crypto.ts";

const pem = generateKeyPairSync("ec", {
	namedCurve: "P-256",
}).privateKey.export({ format: "pem", type: "pkcs8" });

test("the .p8 imports as pasted, with CRLFs, quotes or literal \\n", async () => {
	await importApnsKey(pem);
	await importApnsKey(pem.replaceAll("\n", "\r\n"));
	await importApnsKey(`"${pem.replaceAll("\n", "\\n")}"`);
	await importApnsKey(pem.trim().replaceAll("\n", "\\n"));
});

test("garbage is rejected", async () => {
	await assert.rejects(importApnsKey("not a key"));
});
