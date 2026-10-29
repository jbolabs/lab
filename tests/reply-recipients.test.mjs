import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const { mkdtempSync, rmSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const directory = mkdtempSync(
	join(root, "node_modules", "mailflare-reply-recipients-")
);
after(() => rmSync(directory, { force: true, recursive: true }));
await build({
	bundle: true,
	format: "esm",
	logLevel: "silent",
	outfile: join(directory, "entry.mjs"),
	packages: "external",
	platform: "node",
	stdin: {
		contents: `
			export { createReplyDraft, getReplyRecipients, getReplyThreading, hasAdditionalRecipients } from "./src/components/message-actions/utils.ts";
			export { getOwnAddressForMessage } from "./src/app/(dashboard)/inbox/[messageId]/utils.ts";
			export { parseRawMime } from "./src/lib/email/parse.ts";
		`,
		resolveDir: root,
		sourcefile: "reply-recipients-entry.ts",
	},
	target: "node24",
	tsconfig: join(root, "tsconfig.json"),
});
const {
	createReplyDraft,
	getReplyRecipients,
	getReplyThreading,
	hasAdditionalRecipients,
	getOwnAddressForMessage,
	parseRawMime,
} = await import(pathToFileURL(join(directory, "entry.mjs")).href);

const own = ["hello@example.com"];
const inbound = (fields) => ({
	ccAddr: null,
	direction: "inbound",
	fromAddr: "Website <no-reply@example.com>",
	providerMessageId: null,
	references: null,
	replyTo: null,
	threadId: null,
	toAddr: "hello@example.com",
	...fields,
});

test("a reply answers the sender when there is no Reply-To", () => {
	assert.deepEqual(getReplyRecipients(inbound({}), own, "reply"), {
		cc: [],
		to: ["Website <no-reply@example.com>"],
	});
});

test("a reply goes to every Reply-To address instead of the sender", () => {
	const message = inbound({
		replyTo: "Visitor <visitor@example.net>, other@example.org",
	});
	assert.deepEqual(getReplyRecipients(message, own, "reply"), {
		cc: [],
		to: ["Visitor <visitor@example.net>", "other@example.org"],
	});
});

test("reply-all keeps the other recipients but not the From the Reply-To replaced", () => {
	const message = inbound({
		ccAddr: "boss@example.org",
		replyTo: "visitor@example.net",
		toAddr: "hello@example.com, team@example.org",
	});
	assert.deepEqual(getReplyRecipients(message, own, "replyAll"), {
		cc: ["team@example.org", "boss@example.org"],
		to: ["visitor@example.net"],
	});
});

test("a Reply-To naming only the mailbox itself falls back to the sender", () => {
	const message = inbound({ replyTo: "hello@example.com" });
	assert.deepEqual(getReplyRecipients(message, own, "reply").to, [
		"Website <no-reply@example.com>",
	]);
});

test("the parser keeps the full Reply-To header", async () => {
	const raw = new TextEncoder().encode(
		[
			"From: Website <no-reply@example.com>",
			"To: hello@example.com",
			"Reply-To: Visitor <visitor@example.net>, other@example.org",
			"Subject: Enquiry",
			"",
			"Hi",
		].join("\r\n")
	).buffer;
	const awaitedValue1 = await parseRawMime(raw);
	assert.equal(
		awaitedValue1.replyTo,
		'"Visitor" <visitor@example.net>, other@example.org'
	);
});

const ownAliases = ["hello@example.com", "hello@example.org"];
const aliasMessage = inbound({
	fromAddr: "Owner <hello@example.com>",
	providerMessageId: "<original@example.com>",
	references: "<earlier@example.com>",
	threadId: "alias-thread",
	toAddr: "hello@example.org",
});

test("a reply retains an incoming sender at the same own address or another own alias", () => {
	for (const toAddr of ownAliases) {
		const message = { ...aliasMessage, toAddr };
		assert.deepEqual(getReplyRecipients(message, ownAliases, "reply"), {
			cc: [],
			to: [aliasMessage.fromAddr],
		});
		assert.equal(hasAdditionalRecipients(message, ownAliases), false);
	}
});

test("reply-all retains the own-alias sender while excluding other own addresses and duplicates", () => {
	const message = {
		...aliasMessage,
		ccAddr: "HELLO@example.com, FRIEND@example.net, colleague@example.net",
		toAddr: "hello@example.org, Friend <friend@example.net>",
	};
	assert.deepEqual(getReplyRecipients(message, ownAliases, "replyAll"), {
		cc: ["Friend <friend@example.net>", "colleague@example.net"],
		to: [aliasMessage.fromAddr],
	});
	assert.equal(hasAdditionalRecipients(message, ownAliases), true);
	const outgoing = {
		...message,
		direction: "outbound",
		toAddr: "hello@example.org, friend@example.net",
	};
	assert.deepEqual(getReplyRecipients(outgoing, ownAliases, "replyAll"), {
		cc: ["colleague@example.net"],
		to: ["friend@example.net"],
	});
});

test("Reply-To precedence and own-address fallback work with an own-alias sender", () => {
	const message = {
		...aliasMessage,
		replyTo: "Visitor <visitor@example.net>, other@example.net",
	};
	assert.deepEqual(getReplyRecipients(message, ownAliases, "replyAll"), {
		cc: [],
		to: ["Visitor <visitor@example.net>", "other@example.net"],
	});
	assert.deepEqual(
		getReplyRecipients(
			{ ...aliasMessage, replyTo: "hello@example.org" },
			ownAliases,
			"reply"
		),
		{ cc: [], to: [aliasMessage.fromAddr] }
	);
});

test("a cross-alias reply creates a draft from the receiving alias with the original threading", async (t) => {
	const requests = [];
	t.mock.method(globalThis, "fetch", (url, options) => {
		try {
			assert.equal(
				url,
				"/api/drafts",
				"the test must not contact a real service"
			);
			assert.equal(options.method, "POST");
			requests.push(JSON.parse(options.body));
			return Promise.resolve(Response.json({ draft: { id: "reply-draft" } }));
		} catch (error) {
			return Promise.reject(error);
		}
	});
	const draftId = await createReplyDraft({
		bodyText: "Original message",
		mailboxId: "mailbox-1",
		ownAddress: getOwnAddressForMessage(aliasMessage, ownAliases),
		recipients: getReplyRecipients(aliasMessage, ownAliases, "reply"),
		senderAddress: aliasMessage.fromAddr,
		sentAt: "2026-10-14T12:00:00.000Z",
		subject: "Alias test",
		threading: getReplyThreading(aliasMessage),
	});
	assert.equal(draftId, "reply-draft");
	assert.equal(requests.length, 1);
	assert.equal(requests[0].mailboxId, "mailbox-1");
	assert.equal(requests[0].from, "hello@example.org");
	assert.equal(requests[0].to, aliasMessage.fromAddr);
	assert.equal(requests[0].cc, "");
	assert.equal(requests[0].subject, "Re: Alias test");
	assert.equal(requests[0].inReplyTo, "original@example.com");
	assert.equal(
		requests[0].references,
		"earlier@example.com original@example.com"
	);
	assert.equal(requests[0].threadId, aliasMessage.threadId);
	assert.match(requests[0].html, /Original message/u);
});

test("a missing incoming sender still cannot create a reply draft", async () => {
	const message = { ...aliasMessage, fromAddr: "" };
	const recipients = getReplyRecipients(message, ownAliases, "reply");
	assert.deepEqual(recipients, { cc: [], to: [] });
	await assert.rejects(
		createReplyDraft({ mailboxId: "mailbox-1", recipients, senderAddress: "" }),
		/Sender address is required/u
	);
});
