import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

import { deferredPromise } from "./helpers/deferred.mjs";

const { mkdtempSync, rmSync } = fs;
const { tmpdir } = os;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const bundleDirectory = mkdtempSync(
	join(root, "node_modules", "mailflare-agent-bundle-")
);
await build({
	alias: {
		"cloudflare:workers": "./server/runtime/cloudflare-workers.ts",
	},
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(bundleDirectory, "entry.mjs"),
	packages: "external",
	platform: "node",
	stdin: {
		contents: `
			export { SqliteDatabase } from "./server/runtime/sqlite-database.ts";
			export { applyMigrations } from "./server/runtime/migrate.ts";
			export { createAgentChatStream } from "./src/lib/agent/chat.ts";
			export { runEmailTool } from "./src/lib/agent/tools.ts";
			export { requestAgentSend } from "./src/lib/agent/approvals/utils.ts";
			export { createSession } from "./src/lib/auth/session.ts";
			export { POST as postAgentChat } from "./src/app/api/agent/chat/route.ts";
		`,
		resolveDir: root,
		sourcefile: "agent-test-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const {
	SqliteDatabase,
	applyMigrations,
	createAgentChatStream,
	runEmailTool,
	requestAgentSend,
	createSession,
	postAgentChat,
} = await import(pathToFileURL(join(bundleDirectory, "entry.mjs")).href);
after(() => rmSync(bundleDirectory, { force: true, recursive: true }));

test("assistant reads mail, creates an editable reply draft, and invokes tools through chat", async (t) => {
	const directory = mkdtempSync(join(tmpdir(), "mailflare-agent-"));
	const database = new SqliteDatabase(join(directory, "mailflare.sqlite"));
	t.after(() => {
		database.db.close();
		rmSync(directory, { force: true, recursive: true });
	});
	await applyMigrations(database, join(process.cwd(), "drizzle", "migrations"));
	database.db.exec(`
		INSERT INTO users (id, email, password_hash, name, created_at) VALUES ('user-1', 'owner@example.com', 'hash', 'Owner', 1);
		INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES ('domain-1', 'user-1', 'example.com', 'zone-1', 'active', 1);
		INSERT INTO mailboxes (id, user_id, domain_id, local_part, created_at) VALUES ('mailbox-1', 'user-1', 'domain-1', 'owner', 1);
		INSERT INTO messages (id, user_id, mailbox_id, direction, provider_message_id, from_addr, to_addr, subject, text_body, status, thread_id, created_at)
		VALUES ('email-1', 'user-1', 'mailbox-1', 'inbound', '<email-1@example.net>', 'customer@example.net', 'owner@example.com', 'Question', 'Can we meet Tuesday?', 'received', 'thread-1', 2);
	`);

	const server = createServer(async (request, response) => {
		let raw = "";
		for await (const chunk of request) {
			raw += chunk;
		}
		const body = JSON.parse(raw);
		const hasToolResult = body.messages.some(
			(message) => message.role === "tool"
		);
		response.writeHead(200, { "Content-Type": "text/event-stream" });
		const chunk = (delta, finishReason = null) =>
			response.write(
				`data: ${JSON.stringify({ choices: [{ delta, finish_reason: finishReason, index: 0 }], created: 1, id: "mock-1", model: "test-model", object: "chat.completion.chunk" })}\n\n`
			);
		const drafting = JSON.stringify(body.messages).includes("Draft a reply");
		if (hasToolResult) {
			chunk({
				content: drafting
					? "I created a reply draft for review."
					: "I found one email in your inbox.",
				role: "assistant",
			});
			chunk({}, "stop");
		} else {
			chunk({
				role: "assistant",
				tool_calls: [
					{
						function: drafting
							? {
									arguments:
										'{"emailId":"email-1","body":"Tuesday works for me.","replyAll":false}',
									name: "draft_reply",
								}
							: {
									arguments: '{"folder":"inbox","limit":20}',
									name: "list_emails",
								},
						id: "call-1",
						index: 0,
						type: "function",
					},
				],
			});
			chunk({}, "tool_calls");
		}
		response.end("data: [DONE]\n\n");
	});
	await deferredPromise((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});
	t.after(() => server.close());
	const address = server.address();
	const env = {
		AI_API_KEY: "test-key",
		AI_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
		AI_MODEL: "test-model",
		BUCKET: { delete: async () => {}, get: () => Promise.resolve(null) },
		DB: database,
	};
	const context = {
		env,
		mailboxId: "mailbox-1",
		origin: "chat",
		user: { email: "owner@example.com", id: "user-1", role: "user" },
	};

	const direct = { ...context, origin: "mcp" };
	const listed = await runEmailTool(context, "list_emails", {
		folder: "inbox",
		limit: 20,
	});
	assert.equal(listed.emails[0].id, "email-1");
	const email = await runEmailTool(context, "get_email", {
		emailId: "email-1",
	});
	assert.match(email.text, /meet Tuesday/u);
	const thread = await runEmailTool(context, "get_thread", {
		emailId: "email-1",
	});
	assert.equal(thread.emails.length, 1);
	const searched = await runEmailTool(context, "search_emails", {
		limit: 20,
		query: "Tuesday",
	});
	assert.equal(searched.emails[0].id, "email-1");
	const draft = await runEmailTool(context, "draft_reply", {
		body: "Tuesday works for me.",
		emailId: "email-1",
		replyAll: false,
	});
	assert.equal(draft.status, "draft_created");
	const saved = database.db
		.prepare(
			"SELECT to_addr, text_body, status, in_reply_to FROM messages WHERE id = ?"
		)
		.get(draft.draftId);
	assert.equal(saved.to_addr, "customer@example.net");
	assert.equal(saved.text_body, "Tuesday works for me.");
	assert.equal(saved.status, "draft");
	assert.equal(saved.in_reply_to, "<email-1@example.net>");
	assert.equal(
		database.db
			.prepare("SELECT count(*) AS count FROM agent_send_approvals")
			.get().count,
		0
	);
	const newDraft = await runEmailTool(context, "draft_email", {
		body: "Hello again.",
		subject: "Follow up",
		to: "customer@example.net",
	});
	assert.equal(
		database.db
			.prepare("SELECT status FROM messages WHERE id = ?")
			.get(newDraft.draftId).status,
		"draft"
	);
	const pendingDiscard = await runEmailTool(context, "discard_draft", {
		draftId: newDraft.draftId,
		expectedRevision: 1,
	});
	assert.equal(pendingDiscard.status, "pending_approval");
	assert.ok(
		database.db
			.prepare("SELECT id FROM messages WHERE id = ?")
			.get(newDraft.draftId)
	);
	await runEmailTool(direct, "discard_draft", {
		draftId: newDraft.draftId,
		expectedRevision: 1,
	});
	assert.equal(
		database.db
			.prepare("SELECT id FROM messages WHERE id = ?")
			.get(newDraft.draftId),
		undefined
	);
	await runEmailTool(direct, "mark_email_read", {
		emailId: "email-1",
		read: true,
	});
	assert.equal(
		database.db.prepare("SELECT read FROM messages WHERE id = 'email-1'").get()
			.read,
		1
	);
	await runEmailTool(direct, "move_email", {
		destination: "archived",
		emailId: "email-1",
	});
	assert.equal(
		database.db
			.prepare("SELECT status FROM messages WHERE id = 'email-1'")
			.get().status,
		"archived"
	);
	await runEmailTool(direct, "move_email", {
		destination: "inbox",
		emailId: "email-1",
	});

	const { stream } = await createAgentChatStream(
		context,
		"What arrived in my inbox?"
	);
	const awaitedValue1 = await new Response(stream).text();
	const events = awaitedValue1
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	assert.ok(
		events.some(
			(event) =>
				event.type === "tool" &&
				event.name === "list_emails" &&
				event.state === "complete"
		)
	);
	assert.ok(
		events.some(
			(event) => event.type === "text" && event.text.includes("one email")
		)
	);
	assert.equal(events.at(-1).type, "done");
	const drafted = await createAgentChatStream(
		context,
		"Draft a reply to email email-1"
	);
	const awaitedValue2 = await new Response(drafted.stream).text();
	const draftEvents = awaitedValue2
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	assert.ok(
		draftEvents.some(
			(event) =>
				event.type === "tool" &&
				event.name === "draft_reply" &&
				event.state === "complete" &&
				event.result.draftId
		)
	);
	assert.equal(
		database.db
			.prepare("SELECT count(*) AS count FROM agent_send_approvals")
			.get().count,
		0
	);
	globalThis.__mailflareNodeEnv = env;
	t.after(() => {
		delete globalThis.__mailflareNodeEnv;
	});
	const token = await createSession(env, "user-1");
	const request = new Request("http://mailflare.local/api/agent/chat", {
		body: JSON.stringify({
			mailboxId: "mailbox-1",
			text: "What arrived in my inbox?",
		}),
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Origin: "http://mailflare.local",
		},
		method: "POST",
	});
	const routeResponse = await postAgentChat(request);
	assert.equal(routeResponse.status, 200);
	const awaitedValue3 = await routeResponse.text();
	const routeEvents = awaitedValue3
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	assert.ok(
		routeEvents.some(
			(event) =>
				event.type === "tool" &&
				event.name === "list_emails" &&
				event.state === "complete"
		)
	);
	const bindingEnv = {
		...env,
		AI: {
			run: (_model, input) =>
				Promise.resolve({
					choices: [
						{
							finish_reason: input.messages.some(
								(message) => message.role === "tool"
							)
								? "stop"
								: "tool_calls",
							message: input.messages.some((message) => message.role === "tool")
								? {
										content: "I found one email in your inbox.",
										role: "assistant",
									}
								: {
										content: null,
										role: "assistant",
										tool_calls: [
											{
												function: {
													arguments: '{"folder":"inbox","limit":20}',
													name: "list_emails",
												},
												id: "binding-call-1",
												type: "function",
											},
										],
									},
						},
					],
				}),
		},
	};
	const bindingChat = await createAgentChatStream(
		{ ...context, env: bindingEnv },
		"What arrived in my inbox?"
	);
	const awaitedValue4 = await new Response(bindingChat.stream).text();
	const bindingEvents = awaitedValue4
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	assert.ok(
		bindingEvents.some(
			(event) =>
				event.type === "tool" &&
				event.name === "list_emails" &&
				event.state === "complete"
		)
	);
	assert.ok(
		bindingEvents.some(
			(event) => event.type === "text" && event.text.includes("one email")
		)
	);
	await assert.rejects(
		requestAgentSend(env, context.user, draft.draftId, 2),
		/Draft changed/u
	);
	const approval = await requestAgentSend(env, context.user, draft.draftId, 1);
	assert.equal(approval.status, "pending_approval");
	assert.equal(
		database.db
			.prepare("SELECT status FROM agent_send_approvals WHERE id = ?")
			.get(approval.approvalId).status,
		"pending"
	);
});

async function paginationContext(t) {
	const database = new SqliteDatabase(":memory:");
	t.after(() => database.db.close());
	await applyMigrations(database, join(root, "drizzle", "migrations"));
	database.db.exec(`
		INSERT INTO users (id, email, password_hash, name, created_at) VALUES
			('user-1', 'owner@example.com', 'hash', 'Owner', 1),
			('user-2', 'other@example.com', 'hash', 'Other', 1);
		INSERT INTO domains (id, user_id, hostname, zone_id, status, created_at) VALUES ('domain-1', 'user-1', 'example.com', 'zone-1', 'active', 1);
		INSERT INTO mailboxes (id, user_id, domain_id, local_part, created_at) VALUES
			('mailbox-1', 'user-1', 'domain-1', 'owner', 1),
			('mailbox-2', 'user-2', 'domain-1', 'other', 1);
		INSERT INTO messages (id, user_id, mailbox_id, direction, from_addr, to_addr, subject, text_body, status, created_at) VALUES
			('email-1', 'user-1', 'mailbox-1', 'inbound', 'sender@example.net', 'owner@example.com', 'First', 'First email', 'received', 2),
			('email-2', 'user-1', 'mailbox-1', 'inbound', 'sender@example.net', 'owner@example.com', 'Second', 'Second email', 'received', 3),
			('email-3', 'user-1', 'mailbox-1', 'inbound', 'sender@example.net', 'owner@example.com', 'Third', 'Third email', 'received', 4),
			('foreign-email', 'user-2', 'mailbox-2', 'inbound', 'sender@example.net', 'other@example.com', 'Other mailbox', 'Private', 'received', 5),
			('private-draft', 'user-2', 'mailbox-1', 'outbound', 'owner@example.com', 'sender@example.net', 'Other user draft', 'Private', 'draft', 6);
	`);
	return {
		env: { DB: database },
		mailboxId: "mailbox-1",
		origin: "chat",
		user: { email: "owner@example.com", id: "user-1", role: "user" },
	};
}

test("email pagination starts with an omitted or null cursor and follows returned cursors", async (t) => {
	const context = await paginationContext(t);
	const first = await runEmailTool(context, "list_emails", {
		folder: "inbox",
		limit: 1,
	});
	assert.deepEqual(
		first.emails.map((email) => email.id),
		["email-3"]
	);
	assert.equal(first.nextCursor, "email-3");
	assert.deepEqual(
		await runEmailTool(context, "list_emails", {
			cursor: null,
			folder: "inbox",
			limit: 1,
		}),
		first
	);
	const second = await runEmailTool(context, "list_emails", {
		cursor: first.nextCursor,
		folder: "inbox",
		limit: 1,
	});
	assert.deepEqual(
		second.emails.map((email) => email.id),
		["email-2"]
	);
	const third = await runEmailTool(context, "list_emails", {
		cursor: second.nextCursor,
		folder: "inbox",
		limit: 1,
	});
	assert.deepEqual(
		third.emails.map((email) => email.id),
		["email-1"]
	);
	assert.equal(third.nextCursor, null);
	assert.deepEqual(
		await runEmailTool(context, "list_emails", {
			cursor: "email-1",
			folder: "inbox",
			limit: 1,
		}),
		{ emails: [], nextCursor: null }
	);
});

test("email pagination rejects invented and inaccessible cursors with retry guidance", async (t) => {
	const context = await paginationContext(t);
	for (const cursor of [
		"0",
		"initial",
		"missing-email",
		"foreign-email",
		"private-draft",
	]) {
		await assert.rejects(
			runEmailTool(context, "list_emails", {
				cursor,
				folder: "inbox",
				limit: 1,
			}),
			(error) => {
				assert.match(error.message, /Invalid pagination cursor/u);
				assert.match(error.message, /omit cursor|omit the cursor/iu);
				assert.match(error.message, /null/u);
				assert.match(error.message, /nextCursor/u);
				return true;
			}
		);
	}
	await assert.rejects(
		runEmailTool(context, "get_email", { emailId: "missing-email" }),
		/Message not found/u
	);
	await assert.rejects(
		runEmailTool({ ...context, mailboxId: "mailbox-2" }, "list_emails", {
			cursor: "foreign-email",
			folder: "inbox",
		}),
		/Mailbox not found or permission denied/u
	);
});

test("chat receives pagination correction guidance and can retry with a null cursor", async (t) => {
	const context = await paginationContext(t);
	const requests = [];
	const server = createServer(async (request, response) => {
		let raw = "";
		for await (const chunk of request) {
			raw += chunk;
		}
		const body = JSON.parse(raw);
		requests.push(body);
		const results = body.messages.filter((message) => message.role === "tool");
		response.writeHead(200, { "Content-Type": "text/event-stream" });
		const chunk = (delta, finishReason = null) =>
			response.write(
				`data: ${JSON.stringify({ choices: [{ delta, finish_reason: finishReason, index: 0 }], created: 1, id: "pagination-mock", model: "test-model", object: "chat.completion.chunk" })}\n\n`
			);
		const canRetry =
			results.length === 1 &&
			results[0].content.includes("Invalid pagination cursor") &&
			results[0].content.includes("null");
		if (results.length === 0 || canRetry) {
			chunk({
				role: "assistant",
				tool_calls: [
					{
						function: {
							arguments: JSON.stringify({
								cursor: canRetry ? null : "0",
								folder: "inbox",
								limit: 1,
							}),
							name: "list_emails",
						},
						id: `pagination-call-${results.length}`,
						index: 0,
						type: "function",
					},
				],
			});
			chunk({}, "tool_calls");
		} else {
			chunk({
				content:
					results.length === 2
						? "The most recent email is Third."
						: "Unable to list emails.",
				role: "assistant",
			});
			chunk({}, "stop");
		}
		response.end("data: [DONE]\n\n");
	});
	await deferredPromise((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});
	t.after(() => server.close());
	context.env = {
		...context.env,
		AI_API_KEY: "test-key",
		AI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
		AI_MODEL: "test-model",
	};
	const { stream } = await createAgentChatStream(
		context,
		"List my most recent email."
	);
	const awaitedValue5 = await new Response(stream).text();
	const events = awaitedValue5
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	const failed = events.find(
		(event) =>
			event.type === "tool" &&
			event.name === "list_emails" &&
			event.state === "failed"
	);
	assert.match(failed?.result ?? "", /Invalid pagination cursor/u);
	const listed = events.find(
		(event) =>
			event.type === "tool" &&
			event.name === "list_emails" &&
			event.state === "complete"
	);
	assert.deepEqual(
		listed?.result.emails.map((email) => email.id),
		["email-3"]
	);
	assert.ok(
		events.some(
			(event) => event.type === "text" && event.text.includes("Third")
		)
	);
	assert.equal(requests.length, 3);
	// Inspect the actual tool arguments replayed to the provider between steps.
	assert.equal(
		JSON.parse(
			requests[1].messages.find((message) => message.tool_calls?.length)
				.tool_calls[0].function.arguments
		).cursor,
		"0"
	);
	assert.equal(
		JSON.parse(
			requests[2].messages.findLast((message) => message.tool_calls?.length)
				.tool_calls[0].function.arguments
		).cursor,
		null
	);
});
