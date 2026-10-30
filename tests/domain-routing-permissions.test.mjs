import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { getTableConfig } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const project = join(import.meta.dirname, "..");
const temporary = mkdtempSync(
	join(project, "node_modules", "permission-test-")
);
after(() => rmSync(temporary, { force: true, recursive: true }));
const mocks = {
	"@/db": "export function getDb(){return globalThis.permissionDb}",
	"@/lib/api/auth":
		"export async function requireSessionUser(){return globalThis.permissionUser?{user:globalThis.permissionUser,error:null}:{user:null,error:Response.json({error:'Unauthorized'},{status:401})}}",
	"@/lib/auth/cookies":
		"export async function requireUser(){return globalThis.permissionUser}",
	"@/lib/cloudflare": "export function getEnv(){return {}}",
	"@/lib/mailboxes/access":
		"export async function getMailboxAccessLevel(db,user,id){return globalThis.managedMailboxes.includes(id)?{canManage:true,mailbox:{id,domainId:'d-owner'}}:null} export async function listAccessibleMailboxes(){return []}",
};
await build({
	alias: { "@": join(project, "src") },
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(temporary, "routes.mjs"),
	packages: "external",
	platform: "node",
	plugins: [
		{
			name: "test-auth-and-db",
			setup(builder) {
				builder.onResolve(
					{
						filter:
							/^(?:@\/db|@\/lib\/(?:cloudflare|auth\/cookies|api\/auth|mailboxes\/access))$/,
					},
					(args) => ({ namespace: "mock", path: args.path })
				);
				builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
					contents: mocks[args.path],
					loader: "js",
				}));
			},
		},
	],
	stdin: {
		contents: `export * as domain from './src/app/api/routing-rules/domain/route';export * as domainItem from './src/app/api/routing-rules/domain/[id]/route';export * as mailbox from './src/app/api/routing-rules/route';export * as mailboxItem from './src/app/api/routing-rules/[id]/route';export * as schema from './src/db/schema';export {emptyRuleInput} from './src/components/settings/domain-routing/utils';`,
		loader: "ts",
		resolveDir: project,
	},
});
const { domain, domainItem, mailbox, mailboxItem, schema, emptyRuleInput } =
	await import(pathToFileURL(join(temporary, "routes.mjs")).href);
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const owner = {
	canManageDomains: false,
	id: "owner",
	isPrimaryAdmin: true,
	role: "admin",
};
const manager = {
	canManageDomains: true,
	createdByUserId: "owner",
	id: "manager",
	isPrimaryAdmin: false,
	role: "admin",
};
const ordinary = {
	canManageDomains: false,
	id: "user",
	isPrimaryAdmin: false,
	role: "user",
};
let sqlite;
function setup(user) {
	sqlite?.close();
	sqlite = new DatabaseSync(":memory:");
	for (const value of Object.values(schema)) {
		let table;
		try {
			table = getTableConfig(value);
		} catch {
			continue;
		}
		sqlite.exec(
			`CREATE TABLE ${quote(table.name)} (${table.columns.map((column) => `${quote(column.name)} ${column.getSQLType()}`).join(",")})`
		);
	}
	globalThis.permissionDb = drizzle((sql, params, method) => {
		try {
			const query = sqlite.prepare(sql);
			if (method === "run") {
				query.run(...params);
				return Promise.resolve({ rows: [] });
			}
			query.setReturnArrays(true);
			return Promise.resolve({ rows: query.all(...params) });
		} catch (error) {
			return Promise.reject(error);
		}
	});
	globalThis.permissionUser = user;
	globalThis.managedMailboxes = ["m-user", "m-shared"];
	sqlite.exec(
		"INSERT INTO domains(id,user_id,hostname) VALUES ('d-owner','owner','example.test'),('d-other','other','other.test'),('d-self','manager','self.test'); INSERT INTO mailboxes(id,user_id,domain_id,local_part,disabled) VALUES ('m-user','user','d-owner','user',0),('m-shared','owner','d-owner','team',0),('m-other','other','d-other','other',0); INSERT INTO routing_rules(id,user_id,domain_id,scope,mailbox_id,match_field,match_operator,match_value,action,enabled,keep_copy,priority,created_at) VALUES ('r-domain','owner','d-owner','domain','m-user','recipient','exact','*','store',1,0,100,0),('r-mailbox','user','d-owner','mailbox','m-user','sender','contains','news','spam',1,0,10,0),('r-other','other','d-other','domain','m-other','recipient','exact','*','store',1,0,100,0);"
	);
}
after(() => {
	sqlite?.close();
	delete globalThis.permissionDb;
	delete globalThis.permissionUser;
	delete globalThis.managedMailboxes;
});
const input = (overrides) => ({
	...emptyRuleInput("d-owner"),
	mailboxId: "m-user",
	matchValue: "*",
	...overrides,
});
const request = (path, method, body, origin = "https://mail.test") =>
	new Request(`https://mail.test${path}`, {
		headers: { "Content-Type": "application/json", Origin: origin },
		method: method === undefined ? "GET" : method,
		...(body ? { body: JSON.stringify(body) } : {}),
	});
const context = (id) => ({ params: Promise.resolve({ id }) });

test("mailbox owners, full-access sharers and mailbox-only admins cannot use any domain rule API", async () => {
	for (const user of [
		ordinary,
		{ ...ordinary, id: "shared-user" },
		{
			canManageDomains: false,
			canManageMailboxes: true,
			createdByUserId: "owner",
			id: "mailbox-admin",
			isPrimaryAdmin: false,
			role: "admin",
		},
		{ ...ordinary, canManageDomains: true },
	]) {
		setup(user);
		const awaitedValue1 = await domain.GET(
			request("/api/routing-rules/domain?list=true")
		);
		assert.equal(awaitedValue1.status, 403);
		for (const suffix of ["", "&mailboxId=m-user", "&mailboxId=m-shared"]) {
			const awaitedValue2 = await domain.GET(
				request(`/api/routing-rules/domain?domainId=d-owner${suffix}`)
			);
			assert.equal(awaitedValue2.status, 403);
			const awaitedValue3 = await domain.POST(
				request(`/api/routing-rules/domain?x=1${suffix}`, "POST", input())
			);
			assert.equal(awaitedValue3.status, 403);
			const awaitedValue4 = await domainItem.PATCH(
				request(
					`/api/routing-rules/domain/r-domain?x=1${suffix}`,
					"PATCH",
					input()
				),
				context("r-domain")
			);
			assert.equal(awaitedValue4.status, 403);
			const awaitedValue5 = await domainItem.DELETE(
				request(`/api/routing-rules/domain/r-domain?x=1${suffix}`, "DELETE"),
				context("r-domain")
			);
			assert.equal(awaitedValue5.status, 403);
		}
		assert.equal(
			sqlite
				.prepare("SELECT action FROM routing_rules WHERE id='r-domain'")
				.get().action,
			"store"
		);
	}
});
test("primary/domain admins retain CRUD, same-domain destinations and owner isolation", async () => {
	for (const user of [owner, manager]) {
		setup(user);
		const listed = await domain.GET(
			request("/api/routing-rules/domain?list=true")
		);
		assert.equal(listed.status, 200);
		const awaitedValue6 = await listed.json();
		assert.deepEqual(
			awaitedValue6.domains.map((item) => item.id).toSorted(),
			user === owner ? ["d-owner"] : ["d-owner", "d-self"]
		);
		const awaitedValue7 = await domain.GET(
			request("/api/routing-rules/domain?domainId=d-owner&mailboxId=m-user")
		);
		assert.equal(awaitedValue7.status, 200);
		const awaitedValue8 = await domain.POST(
			request("/api/routing-rules/domain", "POST", input())
		);
		assert.equal(awaitedValue8.status, 200);
		const awaitedValue9 = await domainItem.PATCH(
			request(
				"/api/routing-rules/domain/r-domain",
				"PATCH",
				input({ action: "reject", mailboxId: null })
			),
			context("r-domain")
		);
		assert.equal(awaitedValue9.status, 200);
		const awaitedValue10 = await domain.GET(
			request("/api/routing-rules/domain?domainId=d-other")
		);
		assert.equal(awaitedValue10.status, 403);
		const awaitedValue11 = await domain.POST(
			request(
				"/api/routing-rules/domain",
				"POST",
				input({ mailboxId: "m-other" })
			)
		);
		assert.equal(awaitedValue11.status, 403);
		const awaitedValue12 = await domainItem.PATCH(
			request(
				"/api/routing-rules/domain/r-domain",
				"PATCH",
				input({ domainId: "d-other", mailboxId: "m-other" })
			),
			context("r-domain")
		);
		assert.equal(awaitedValue12.status, 403);
		const awaitedValue13 = await domainItem.DELETE(
			request("/api/routing-rules/domain/r-other", "DELETE"),
			context("r-other")
		);
		assert.equal(awaitedValue13.status, 403);
		const awaitedValue14 = await domainItem.DELETE(
			request("/api/routing-rules/domain/r-domain", "DELETE"),
			context("r-domain")
		);
		assert.equal(awaitedValue14.status, 200);
	}
	setup(manager);
	const awaitedValue15 = await domain.GET(
		request("/api/routing-rules/domain?domainId=d-self")
	);
	assert.equal(awaitedValue15.status, 200);
});
test("mailbox routes cannot modify domain rules even with the destination inbox permission", async () => {
	setup(ordinary);
	const payload = {
		destination: "spam",
		mailboxId: "m-user",
		matchField: "email",
		matchOperator: "contains",
		matchValue: "news",
		priority: 100,
	};
	const awaitedValue16 = await mailboxItem.PATCH(
		request("/api/routing-rules/r-domain", "PATCH", payload),
		context("r-domain")
	);
	assert.equal(awaitedValue16.status, 404);
	const awaitedValue17 = await mailboxItem.DELETE(
		request("/api/routing-rules/r-domain", "DELETE"),
		context("r-domain")
	);
	assert.equal(awaitedValue17.status, 404);
	const awaitedValue18 = await mailbox.GET(
		request("/api/routing-rules?mailboxId=m-user")
	);
	const listed = await awaitedValue18.json();
	assert.deepEqual(
		listed.rules.map((rule) => rule.id),
		["r-mailbox"]
	);
	const awaitedValue19 = await mailbox.POST(
		request("/api/routing-rules", "POST", payload)
	);
	assert.equal(awaitedValue19.status, 200);
	const awaitedValue20 = await mailboxItem.PATCH(
		request("/api/routing-rules/r-mailbox", "PATCH", payload),
		context("r-mailbox")
	);
	assert.equal(awaitedValue20.status, 200);
	const awaitedValue21 = await mailboxItem.DELETE(
		request("/api/routing-rules/r-mailbox", "DELETE"),
		context("r-mailbox")
	);
	assert.equal(awaitedValue21.status, 200);
});
test("cross-origin domain mutations and unauthenticated callers are denied", async () => {
	setup(owner);
	const awaitedValue22 = await domain.POST(
		request("/api/routing-rules/domain", "POST", input(), "https://evil.test")
	);
	assert.equal(awaitedValue22.status, 403);
	const awaitedValue23 = await domainItem.PATCH(
		request(
			"/api/routing-rules/domain/r-domain",
			"PATCH",
			input(),
			"https://evil.test"
		),
		context("r-domain")
	);
	assert.equal(awaitedValue23.status, 403);
	const awaitedValue24 = await domainItem.DELETE(
		request(
			"/api/routing-rules/domain/r-domain",
			"DELETE",
			undefined,
			"https://evil.test"
		),
		context("r-domain")
	);
	assert.equal(awaitedValue24.status, 403);
	globalThis.permissionUser = null;
	const awaitedValue25 = await domain.GET(
		request("/api/routing-rules/domain?domainId=d-owner")
	);
	assert.equal(awaitedValue25.status, 401);
});
