/**
 * Deploys the whole stack (`alchemy.run.ts`) to local emulators and drives it
 * over HTTP: the Vite build, every binding, the migrations on a fresh
 * database, first-run setup, sign-in and the cron handler. No cloud
 * credentials; state stays in `.alchemy/`. Run with `npm run test:stack`.
 */
import * as Cloudflare from "@alchemy.run/cloudflare";
import { expect } from "@alchemy.run/test";
import * as Test from "@alchemy.run/test/Bun";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { Lab } from "../alchemy.run.ts";

// The deployed program on local state, so nothing reaches the shared state store.
const Stack = Alchemy.Stack(
	"mail",
	{ providers: Cloudflare.providers(), state: Alchemy.localState() },
	Lab
);

const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
	dev: true,
	providers: Cloudflare.providers(),
});

const stack = beforeAll(deploy(Stack), { timeout: 300_000 });
afterAll(destroy(Stack), { timeout: 120_000 });

const admin = {
	email: "admin@lab.test",
	password: "correct-horse-battery-9",
};

const post = (url: string, body: unknown) =>
	Effect.gen(function* postJson() {
		const client = yield* HttpClient.HttpClient;
		return yield* client.execute(
			HttpClientRequest.post(url).pipe(
				HttpClientRequest.setHeader("origin", new URL(url).origin),
				HttpClientRequest.bodyJsonUnsafe(body)
			)
		);
	});

test(
	"a fresh database is migrated and ready for setup",
	Effect.gen(function* migrated() {
		const { url } = yield* stack;
		const res = yield* Test.getWhenReady(`${url}/api/setup/status`);
		expect(res.status).toBe(200);
		expect(yield* res.json).toEqual({
			hasAdminAccount: false,
			hasPrimaryDomain: false,
			primaryDomain: null,
		});
	}),
	{ timeout: 120_000 }
);

test(
	"first-run setup creates an admin who can sign in",
	Effect.gen(function* setup() {
		const { url } = yield* stack;
		const prepare = yield* post(`${url}/api/setup/prepare`, {});
		expect(prepare.status).toBe(200);

		const register = yield* post(`${url}/api/auth/register`, {
			domain: "lab.test",
			password: admin.password,
			resetEmail: "owner@elsewhere.test",
			skipDns: true,
			username: "admin",
		});
		expect(register.status).toBe(200);

		const login = yield* post(`${url}/api/auth/login`, admin);
		expect(login.status).toBe(200);
		expect(yield* login.json).toMatchObject({ ok: true });
	}),
	{ timeout: 120_000 }
);

test(
	"pages render on the server",
	Effect.gen(function* pages() {
		const { url } = yield* stack;
		const res = yield* Test.getWhenReady(`${url}/login`);
		expect(res.status).toBe(200);
		expect(yield* res.text).toContain("<title>");
	}),
	{ timeout: 120_000 }
);

test(
	"the cron handler runs",
	Effect.gen(function* cron() {
		const { url } = yield* stack;
		const res = yield* Test.getWhenReady(
			`${url}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent("*/5 * * * *")}`
		);
		expect(res.status).toBe(200);
	}),
	{ timeout: 120_000 }
);
