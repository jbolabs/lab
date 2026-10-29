import assert from "node:assert/strict";
import test from "node:test";

import {
	isRelayHandle,
	relayBaseUrl,
	sendViaRelay,
} from "../src/lib/push/relay.ts";

const send = (fetchImpl) =>
	sendViaRelay("https://r.example", "mfr1.h", {}, undefined, fetchImpl);
const reply =
	(status, body = {}) =>
	() =>
		Promise.resolve(Response.json(body, { status }));
test("relay handles are told apart from APNs tokens", () => {
	assert.equal(isRelayHandle("mfr1.abc"), true);
	assert.equal(isRelayHandle("ab".repeat(32)), false);
});

test("the relay URL is an https origin without a trailing slash", () => {
	assert.equal(
		relayBaseUrl({ APNS_RELAY_URL: "https://ios-relay.mailflare.co" }),
		"https://ios-relay.mailflare.co"
	);
	assert.equal(
		relayBaseUrl({ APNS_RELAY_URL: " https://ios-relay.mailflare.co/ " }),
		"https://ios-relay.mailflare.co"
	);
	assert.equal(
		relayBaseUrl({ APNS_RELAY_URL: "http://localhost:3100" }),
		"http://localhost:3100"
	);
	assert.equal(
		relayBaseUrl({ APNS_RELAY_URL: "http://relay.example.com" }),
		null
	);
	assert.equal(relayBaseUrl({ APNS_RELAY_URL: "not a url" }), null);
	assert.equal(relayBaseUrl({}), null);
});

test("a push is one POST to /api/v1/push with the handle", async () => {
	let seen;
	const fetchImpl = (url, init) => {
		try {
			seen = { init, url };
			return Promise.resolve(new Response("{}", { status: 200 }));
		} catch (error) {
			return Promise.reject(error);
		}
	};
	const payload = { aps: { alert: "x" } };
	assert.deepEqual(
		await sendViaRelay("https://r.example", "mfr1.h", payload, "c1", fetchImpl),
		{ kind: "sent" }
	);
	assert.equal(seen.url, "https://r.example/api/v1/push");
	assert.deepEqual(JSON.parse(seen.init.body), {
		collapseId: "c1",
		handle: "mfr1.h",
		payload,
	});
});

test("the relay's answers map to what the server should do", async () => {
	assert.deepEqual(await send(reply(404)), { kind: "gone", status: 404 });
	assert.deepEqual(await send(reply(410)), { kind: "gone", status: 410 });
	assert.deepEqual(await send(reply(429)), { kind: "retry", status: 429 });
	assert.deepEqual(await send(reply(503)), { kind: "retry", status: 503 });
	assert.deepEqual(await send(reply(502, { error: "Apple rejected" })), {
		kind: "retry",
		status: 502,
	});
	assert.deepEqual(await send(reply(400, { error: "bad payload" })), {
		error: "bad payload",
		kind: "failed",
		status: 400,
	});
	assert.deepEqual(
		await send(() => {
			try {
				throw new Error("offline");
			} catch (error) {
				return Promise.reject(error);
			}
		}),
		{ kind: "retry", status: 0 }
	);
});
