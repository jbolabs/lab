import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

import { deferredPromise } from "./helpers/deferred.mjs";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const directory = mkdtempSync(
	join(root, "node_modules", "mailflare-account-test-")
);
after(() => rmSync(directory, { force: true, recursive: true }));
await build({
	alias: {
		"cloudflare:workers": "./server/runtime/cloudflare-workers.ts",
	},
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(directory, "entry.mjs"),
	packages: "external",
	platform: "node",
	stdin: {
		contents: `
			export { SqliteDatabase } from "./server/runtime/sqlite-database.ts";
			export { applyMigrations } from "./server/runtime/migrate.ts";
			export { getDb } from "./src/db/index.ts";
			export { createSession } from "./src/lib/auth/session.ts";
			export { generateApiKey } from "./src/lib/api-keys.ts";
			export { createUserAccountSchema } from "./src/lib/validators.ts";
			export { POST as dashboardCreate } from "./src/app/api/accounts/route.ts";
			export { POST as apiCreate } from "./src/app/api/v1/accounts/route.ts";
			export { authenticateApiKeyValue } from "./src/lib/api/key-auth.ts";
			export { registerAdminMcpTools } from "./src/lib/mcp/admin-tools.ts";
			export { getMailboxDomainAddresses } from "./src/lib/mailboxes/domain-addresses.ts";
			export { resolveInboundAddress } from "./src/lib/email/routing.ts";
			export { getAuthorizedSenderAddress } from "./src/lib/email/sender.ts";
		`,
		resolveDir: root,
		sourcefile: "account-alias-test-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const {
	SqliteDatabase,
	applyMigrations,
	getDb,
	createSession,
	generateApiKey,
	createUserAccountSchema,
	dashboardCreate,
	apiCreate,
	authenticateApiKeyValue,
	registerAdminMcpTools,
	getMailboxDomainAddresses,
	resolveInboundAddress,
	getAuthorizedSenderAddress,
} = await import(pathToFileURL(join(directory, "entry.mjs")).href);
const key = generateApiKey();

async function fixture(t, { rules = [], failAddress, slowAddress } = {}) {
	const database = new SqliteDatabase(":memory:");
	t.after(() => database.db.close());
	await applyMigrations(database, join(root, "drizzle/migrations"));
	database.db.exec(`
		INSERT INTO users (id, email, password_hash, name, role, is_primary_admin, created_at) VALUES
			('admin', 'owner@one.test', 'hash', 'Owner', 'admin', 1, 1),
			('other', 'owner@foreign.test', 'hash', 'Other', 'admin', 0, 1);
		INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES
			('one', 'admin', 'one.test', 'zone-one', 'active', 1),
			('two', 'admin', 'two.test', 'zone-two', 'active', 1),
			('pending', 'admin', 'pending.test', 'zone-pending', 'pending', 1),
			('foreign', 'other', 'foreign.test', 'zone-foreign', 'active', 1);
	`);
	database.db
		.prepare(
			"INSERT INTO api_keys (id, user_id, name, prefix, key_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
		)
		.run("key", "admin", "Test", key.prefix, key.hash, '["accounts"]', 1);
	const env = {
		CF_TOKEN: "test-only",
		DB: database,
		MAILFLARE_RUNTIME: "node",
	};
	globalThis.__mailflareNodeEnv = env;
	t.after(() => {
		delete globalThis.__mailflareNodeEnv;
	});
	const session = await createSession(env, "admin");
	const currentRules = structuredClone(rules);
	const calls = [];
	let nextRule = 0;
	t.mock.method(globalThis, "fetch", async (url, init = {}) => {
		const parsed = new URL(url);
		assert.equal(
			parsed.origin,
			"https://api.cloudflare.com",
			"tests must never contact a real service"
		);
		const match = parsed.pathname.match(
			/^\/client\/v4\/zones\/(?<capture1>[^/]+)\/email\/routing\/rules(?:\/(?<capture2>[^/]+))?$/u
		);
		assert.ok(match, parsed.pathname);
		const [, zoneId, ruleId] = match;
		const method = init.method ?? "GET";
		const body = init.body ? JSON.parse(init.body) : null;
		calls.push({ body, method, ruleId, zoneId });
		if (method === "GET") {
			return Response.json({
				result: structuredClone(
					currentRules.filter((rule) => rule.zoneId === zoneId)
				),
				success: true,
			});
		}
		const address = body?.matchers?.[0]?.value;
		if (slowAddress && address === slowAddress) {
			await deferredPromise((resolve) => {
				setTimeout(resolve, 20);
			});
		}
		if (failAddress && address === failAddress) {
			return Response.json(
				{ errors: [{ message: "Simulated routing failure" }], success: false },
				{ status: 502 }
			);
		}
		if (method === "POST") {
			const rule = { ...body, id: `new-${(nextRule += 1)}`, zoneId };
			currentRules.push(rule);
			return Response.json({ result: rule, success: true });
		}
		const index = currentRules.findIndex(
			(rule) => rule.id === ruleId && rule.zoneId === zoneId
		);
		assert.notEqual(index, -1);
		if (method === "DELETE") {
			currentRules.splice(index, 1);
		}
		if (method === "PUT") {
			currentRules[index] = { ...body, id: ruleId, zoneId };
		}
		return Response.json({
			result: currentRules[index] ?? null,
			success: true,
		});
	});
	const post = (kind, overrides, token) => {
		const handler = kind === "dashboard" ? dashboardCreate : apiCreate;
		return handler(
			new Request(
				`https://mailflare.test/api/${kind === "dashboard" ? "" : "v1/"}accounts`,
				{
					body: JSON.stringify({
						domainId: "one",
						password: "test-password",
						username: "sam",
						...overrides,
					}),
					headers: {
						Authorization: `Bearer ${token ?? (kind === "dashboard" ? session : key.fullKey)}`,
						"Content-Type": "application/json",
					},
					method: "POST",
				}
			)
		);
	};
	const mailbox = () => {
		const row = database.db
			.prepare("SELECT * FROM mailboxes WHERE local_part = 'sam'")
			.get();
		return (
			row && {
				domainId: row.domain_id,
				id: row.id,
				localPart: row.local_part,
				useAllDomains: !!row.use_all_domains,
				userId: row.user_id,
			}
		);
	};
	return { calls, currentRules, database, db: getDb(env), env, mailbox, post };
}

for (const kind of ["dashboard", "api"]) {
	test(`${kind}: primary-only creation does not grant addresses on other domains`, async (t) => {
		const f = await fixture(t);
		const awaitedValue1 = await f.post(kind, { useAllDomains: false });
		assert.equal(awaitedValue1.status, 201);
		const mailbox = f.mailbox();
		assert.ok(
			f.database.db
				.prepare("SELECT booking_username FROM users WHERE id = ?")
				.get(mailbox.userId).booking_username
		);
		assert.equal(mailbox.useAllDomains, false);
		assert.deepEqual(await getMailboxDomainAddresses(f.db, mailbox), [
			"sam@one.test",
		]);
		const awaitedValue2 = await resolveInboundAddress(f.db, "sam@one.test");
		assert.equal(awaitedValue2.mailbox.mailboxId, mailbox.id);
		assert.equal(await resolveInboundAddress(f.db, "sam@two.test"), null);
		await assert.rejects(
			getAuthorizedSenderAddress(f.env, {
				from: "sam@two.test",
				mailboxId: mailbox.id,
				userId: mailbox.userId,
			}),
			/Sender address/u
		);
		assert.deepEqual(
			f.calls
				.filter((call) => call.method === "POST")
				.map((call) => call.body.matchers[0].value),
			["sam@one.test"]
		);
	});

	test(`${kind}: explicit aliases receive and send through the same mailbox`, async (t) => {
		const f = await fixture(t);
		const response = await f.post(kind, {
			aliases: [
				{ domainId: "two", localPart: " Sales " },
				{ domainId: "one", localPart: "support" },
			],
			useAllDomains: false,
		});
		assert.equal(response.status, 201);
		const body = await response.json();
		assert.equal(body.account.email, "sam@one.test");
		assert.equal("passwordHash" in body.account, false);
		const mailbox = f.mailbox();
		const awaitedValue3 = await getMailboxDomainAddresses(f.db, mailbox);
		assert.deepEqual(awaitedValue3.toSorted(), [
			"sales@two.test",
			"sam@one.test",
			"support@one.test",
		]);
		const awaitedValue4 = await resolveInboundAddress(f.db, "sales@two.test");
		assert.equal(awaitedValue4.mailbox.mailboxId, mailbox.id);
		const awaitedValue5 = await getAuthorizedSenderAddress(f.env, {
			from: "sales@two.test",
			mailboxId: mailbox.id,
			userId: mailbox.userId,
		});
		assert.equal(awaitedValue5.mailboxId, mailbox.id);
		assert.equal(await resolveInboundAddress(f.db, "sam@two.test"), null);
		f.database.db.exec(
			"INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES ('later', 'admin', 'later.test', 'manual', 'active', 1)"
		);
		assert.equal(await resolveInboundAddress(f.db, "sam@later.test"), null);
		const awaitedValue6 = await getMailboxDomainAddresses(f.db, mailbox);
		assert.equal(awaitedValue6.includes("sam@later.test"), false);
	});
}

test("omitted settings preserve API compatibility; opting in includes future domains", async (t) => {
	const f = await fixture(t);
	const awaitedValue7 = await f.post("api");
	assert.equal(awaitedValue7.status, 201);
	assert.equal(f.mailbox().useAllDomains, true);
	assert.deepEqual(await getMailboxDomainAddresses(f.db, f.mailbox()), [
		"sam@one.test",
		"sam@two.test",
	]);
	f.database.db.exec(
		"INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES ('later', 'admin', 'later.test', 'manual', 'active', 1)"
	);
	const awaitedValue8 = await resolveInboundAddress(f.db, "sam@later.test");
	assert.equal(awaitedValue8.mailbox.mailboxId, f.mailbox().id);
	const awaitedValue9 = await f.post("dashboard", {
		aliases: [{ domainId: "two", localPart: "billing" }],
		useAllDomains: true,
		username: "jane",
	});
	assert.equal(awaitedValue9.status, 201);
	const address = await resolveInboundAddress(f.db, "billing@two.test");
	assert.equal(address.mailbox.localPart, "jane");
});

test("admin MCP forwards alias selection to the same account creation handler", async (t) => {
	const f = await fixture(t);
	const handlers = new Map();
	const auth = await authenticateApiKeyValue(f.env, key.fullKey);
	registerAdminMcpTools(
		{ registerTool: (name, _schema, handler) => handlers.set(name, handler) },
		{ keyId: auth.keyId, mailboxIds: [], scopes: auth.scopes, user: auth.user },
		"https://mailflare.test",
		`Bearer ${key.fullKey}`
	);
	const result = await handlers.get("manage_accounts")({
		action: "create",
		data: {
			aliases: [{ domainId: "two", localPart: "sales" }],
			domainId: "one",
			password: "test-password",
			useAllDomains: false,
			username: "sam",
		},
	});
	assert.equal(result.isError, false);
	assert.equal(JSON.parse(result.content[0].text).status, 201);
	const awaitedValue10 = await getMailboxDomainAddresses(f.db, f.mailbox());
	assert.deepEqual(awaitedValue10.toSorted(), [
		"sales@two.test",
		"sam@one.test",
	]);
});

test("invalid, duplicate, foreign, and inactive aliases fail before provisioning", async (t) => {
	const f = await fixture(t);
	for (const aliases of [
		[{ domainId: "one", localPart: "s.a.m+tag" }],
		[
			{ domainId: "two", localPart: "sales" },
			{ domainId: "two", localPart: "SALES" },
		],
		[{ domainId: "foreign", localPart: "sales" }],
		[{ domainId: "pending", localPart: "sales" }],
		[{ domainId: "missing", localPart: "sales" }],
		[{ domainId: "two", localPart: "not an address" }],
		[{ domainId: "two", localPart: "+tag" }],
	]) {
		const awaitedValue11 = await f.post("api", {
			aliases,
			useAllDomains: false,
		});
		assert.equal(awaitedValue11.status, 400, JSON.stringify(aliases));
	}
	assert.equal(f.calls.length, 0);
	assert.equal(
		f.database.db.prepare("SELECT count(*) AS count FROM users").get().count,
		2
	);
	assert.equal(
		f.database.db.prepare("SELECT count(*) AS count FROM mailbox_aliases").get()
			.count,
		0
	);
});

test("mailbox and alias conflicts include normalized primary addresses", async (t) => {
	const f = await fixture(t);
	f.database.db.exec(`
		INSERT INTO mailboxes (id, user_id, domain_id, local_part, created_at) VALUES ('existing', 'admin', 'two', 'sales', 1);
		INSERT INTO mailbox_aliases (id, mailbox_id, domain_id, local_part, created_at) VALUES ('alias', 'existing', 'one', 'support', 1);
	`);
	for (const input of [
		{ aliases: [{ domainId: "two", localPart: "s.a.l.e.s+tag" }] },
		{ aliases: [{ domainId: "one", localPart: "SUPPORT" }] },
		{ username: "support" },
		{ username: "s.u.p.p.o.r.t+tag" },
	]) {
		const awaitedValue12 = await f.post("dashboard", {
			useAllDomains: false,
			...input,
		});
		assert.equal(awaitedValue12.status, 409);
	}
	assert.equal(f.calls.length, 0);
	assert.equal(
		f.database.db.prepare("SELECT count(*) AS count FROM users").get().count,
		2
	);
});

test("explicit addresses take precedence over implicit all-domain aliases", async (t) => {
	const f = await fixture(t);
	f.database.db.exec(
		"INSERT INTO mailboxes (id, user_id, domain_id, local_part, use_all_domains, created_at) VALUES ('existing', 'admin', 'one', 'sales', 1, 1)"
	);
	const awaitedValue13 = await f.post("api", {
		aliases: [{ domainId: "two", localPart: "sales" }],
		useAllDomains: false,
	});
	assert.equal(awaitedValue13.status, 201);
	const awaitedValue14 = await resolveInboundAddress(f.db, "sales@two.test");
	assert.equal(awaitedValue14.mailbox.mailboxId, f.mailbox().id);
	const awaitedValue15 = await resolveInboundAddress(f.db, "sales@one.test");
	assert.equal(awaitedValue15.mailbox.mailboxId, "existing");
});

test("database failures leave no partial account, aliases, or routing rules", async (t) => {
	const f = await fixture(t);
	f.database.db.exec(
		"CREATE TRIGGER fail_alias BEFORE INSERT ON mailbox_aliases WHEN NEW.local_part = 'alias40' BEGIN SELECT RAISE(ABORT, 'Simulated insert failure'); END"
	);
	const aliases = Array.from({ length: 41 }, (_, i) => ({
		domainId: "two",
		localPart: `alias${i}`,
	}));
	const awaitedValue16 = await f.post("api", { aliases, useAllDomains: false });
	assert.equal(awaitedValue16.status, 502);
	assert.equal(
		f.database.db.prepare("SELECT count(*) AS count FROM users").get().count,
		2
	);
	assert.equal(
		f.database.db.prepare("SELECT count(*) AS count FROM mailboxes").get()
			.count,
		0
	);
	assert.equal(
		f.database.db.prepare("SELECT count(*) AS count FROM mailbox_aliases").get()
			.count,
		0
	);
	assert.equal(f.calls.length, 0);
});

function workerRule(id, address, enabled) {
	return {
		actions: [{ type: "worker", value: ["mailflare"] }],
		enabled,
		id,
		matchers: [{ field: "to", type: "literal", value: address }],
		name: "Existing route",
		priority: 20,
		zoneId: "zone-one",
	};
}

for (const enabled of [true, false]) {
	test(`routing failure cleans up completed requests and preserves a previously ${enabled ? "enabled" : "disabled"} rule`, async (t) => {
		const original = workerRule("old", "sam@one.test", enabled);
		const f = await fixture(t, {
			failAddress: "broken@two.test",
			rules: [original],
			slowAddress: "slow@two.test",
		});
		const response = await f.post("api", {
			aliases: [
				{ domainId: "two", localPart: "slow" },
				{ domainId: "two", localPart: "broken" },
			],
			useAllDomains: false,
		});
		assert.equal(response.status, 502);
		assert.deepEqual(f.currentRules, [original]);
		assert.equal(
			f.database.db.prepare("SELECT count(*) AS count FROM users").get().count,
			2
		);
		assert.equal(
			f.database.db.prepare("SELECT count(*) AS count FROM mailboxes").get()
				.count,
			0
		);
		assert.equal(
			f.database.db
				.prepare("SELECT count(*) AS count FROM mailbox_aliases")
				.get().count,
			0
		);
		assert.ok(
			f.calls.some((call) => call.method === "DELETE"),
			"a successfully provisioned alias must be rolled back"
		);
	});
}

test("account creation still enforces admin authorization", async (t) => {
	const f = await fixture(t);
	const awaitedValue17 = await f.post("api", {}, "invalid-test-key");
	assert.equal(awaitedValue17.status, 401);
	const awaitedValue18 = await f.post("dashboard", {}, "invalid-test-session");
	assert.equal(awaitedValue18.status, 403);
	assert.equal(f.calls.length, 0);
});

for (const separateDomains of [false, true]) {
	test(`more than 50 aliases on ${separateDomains ? "separate domains" : "one domain"} stay within database parameter limits`, async (t) => {
		const f = await fixture(t);
		f.database.db.exec("UPDATE domains SET zone_id = 'manual'");
		const aliases = Array.from({ length: 125 }, (_, i) => ({
			domainId: separateDomains ? `domain${i}` : "two",
			localPart: `alias${i}`,
		}));
		if (separateDomains) {
			const insert = f.database.db.prepare(
				"INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES (?, 'admin', ?, 'manual', 'active', 1)"
			);
			for (const alias of aliases) {
				insert.run(alias.domainId, `${alias.domainId}.test`);
			}
		}
		const prepare = f.database.prepare.bind(f.database);
		t.mock.method(f.database, "prepare", (query) => {
			const statement = prepare(query);
			const bind = statement.bind.bind(statement);
			statement.bind = (...values) => {
				assert.ok(
					values.length <= 100,
					"each statement must fit D1's 100-parameter limit"
				);
				return bind(...values);
			};
			return statement;
		});
		const awaitedValue19 = await f.post("api", {
			aliases,
			useAllDomains: false,
		});
		assert.equal(awaitedValue19.status, 201);
		assert.equal(
			f.database.db
				.prepare("SELECT count(*) AS count FROM mailbox_aliases")
				.get().count,
			125
		);
		const awaitedValue20 = await getMailboxDomainAddresses(f.db, f.mailbox());
		assert.equal(awaitedValue20.length, 126);
		assert.equal(f.calls.length, 0);
	});
}

test("the all-domain boolean rejects truthy strings", () => {
	const input = { domainId: "one", password: "test-password", username: "sam" };
	assert.equal(
		createUserAccountSchema.safeParse({ ...input, useAllDomains: "false" })
			.success,
		false
	);
});
