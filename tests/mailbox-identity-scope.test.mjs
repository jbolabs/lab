import assert from "node:assert/strict";
import fs from "node:fs";
import nodePath from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
	isPrimaryMailbox,
	resolveMailboxAvatarKey,
	resolveMailboxDisplayName,
	tracksAccountIdentity,
} from "../src/lib/profile/identity-utils.ts";
import { normalizeSource } from "./helpers/source.mjs";

const { readFileSync } = fs;
const { join } = nodePath;

const root = join(import.meta.dirname, "..");
const read = (path) => normalizeSource(readFileSync(join(root, path), "utf-8"));

const ACCOUNT_EMAIL = "sam@example.com";
const primary = {
	avatarKey: "avatars/user-1",
	displayName: "Sam Reyes",
	hostname: "example.com",
	localPart: "sam",
	type: "personal",
};
const secondary = {
	avatarKey: "avatars/mbx-2",
	displayName: "Billing",
	hostname: "example.com",
	localPart: "billing",
	type: "personal",
};
const shared = {
	avatarKey: "avatars/mbx-3",
	displayName: "Support",
	hostname: "example.com",
	localPart: "support",
	type: "shared",
};

test("only the mailbox at the account address carries the account identity", () => {
	assert.equal(isPrimaryMailbox(primary, ACCOUNT_EMAIL), true);
	assert.equal(isPrimaryMailbox(secondary, ACCOUNT_EMAIL), false);

	assert.equal(tracksAccountIdentity(primary, ACCOUNT_EMAIL), true);
	assert.equal(tracksAccountIdentity(secondary, ACCOUNT_EMAIL), false);
	assert.equal(tracksAccountIdentity(shared, ACCOUNT_EMAIL), false);
});

test("the address match ignores case and surrounding space", () => {
	assert.equal(
		isPrimaryMailbox(
			{ hostname: "Example.com", localPart: "Sam" },
			" SAM@example.com "
		),
		true
	);
	assert.equal(isPrimaryMailbox(primary, null), false);
	assert.equal(isPrimaryMailbox(primary, undefined), false);
});

test("a secondary mailbox resolves to its own name and avatar", () => {
	assert.equal(
		resolveMailboxDisplayName(primary, ACCOUNT_EMAIL, "Sam Reyes"),
		"Sam Reyes"
	);
	assert.equal(
		resolveMailboxDisplayName(secondary, ACCOUNT_EMAIL, "Sam Reyes"),
		"Billing"
	);
	assert.equal(
		resolveMailboxAvatarKey(primary, ACCOUNT_EMAIL, "avatars/user-1"),
		"avatars/user-1"
	);
	assert.equal(
		resolveMailboxAvatarKey(secondary, ACCOUNT_EMAIL, "avatars/user-1"),
		"avatars/mbx-2"
	);
});

test("renaming the profile leaves sibling mailboxes untouched (issue #36)", () => {
	const db = new DatabaseSync(":memory:");
	db.exec(`
		CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, avatar_key TEXT);
		CREATE TABLE domains (id TEXT PRIMARY KEY, hostname TEXT NOT NULL);
		CREATE TABLE mailboxes (
			id TEXT PRIMARY KEY, user_id TEXT NOT NULL, domain_id TEXT NOT NULL,
			local_part TEXT NOT NULL, display_name TEXT, avatar_key TEXT, type TEXT NOT NULL
		);
		INSERT INTO users VALUES ('u1', 'sam@example.com', 'Sam Reyes', 'avatars/user-1');
		INSERT INTO domains VALUES ('d1', 'example.com');
		INSERT INTO mailboxes VALUES
			('m1', 'u1', 'd1', 'sam', 'Sam Reyes', 'avatars/user-1', 'personal'),
			('m2', 'u1', 'd1', 'billing', 'Billing', 'avatars/mbx-2', 'personal'),
			('m3', 'u1', 'd1', 'projects', 'Projects', NULL, 'personal');
	`);

	// What syncPersonalIdentity does now: load every personal mailbox with its
	// hostname, then write only to the one that carries the account identity.
	const account = db.prepare("SELECT email FROM users WHERE id = ?").get("u1");
	const rows = db
		.prepare(`
			SELECT m.id, m.local_part, m.type, d.hostname
			FROM mailboxes m JOIN domains d ON d.id = m.domain_id
			WHERE m.user_id = ? AND m.type = 'personal'
		`)
		.all("u1");

	const identityRows = rows.filter((row) =>
		tracksAccountIdentity(
			{ hostname: row.hostname, localPart: row.local_part, type: row.type },
			account.email
		)
	);
	assert.deepEqual(
		identityRows.map((row) => row.id),
		["m1"],
		"exactly one mailbox holds the account identity"
	);

	for (const row of identityRows) {
		db.prepare(
			"UPDATE mailboxes SET display_name = ?, avatar_key = ? WHERE id = ?"
		).run("Sam R. Reyes", "avatars/user-2", row.id);
	}

	const named = db
		.prepare("SELECT id, display_name, avatar_key FROM mailboxes ORDER BY id")
		.all()
		.map((row) => ({ ...row }));
	assert.deepEqual(named, [
		{ avatar_key: "avatars/user-2", display_name: "Sam R. Reyes", id: "m1" },
		{ avatar_key: "avatars/mbx-2", display_name: "Billing", id: "m2" },
		{ avatar_key: null, display_name: "Projects", id: "m3" },
	]);
});

test("the identity write is keyed by mailbox id, not by owner and type", () => {
	const sync = read("src/lib/profile/sync.ts");
	const updates = [
		...sync.matchAll(
			/\.update\(mailboxes\)[\s\S]*?\.where\((?<capture1>[\s\S]*?)\);/gu
		),
	].map((m) => m[1]);
	assert.ok(
		updates.length > 0,
		"no mailbox update found in syncPersonalIdentity"
	);
	for (const where of updates) {
		assert.ok(
			/eq\(mailboxes\.id,/u.test(where),
			`mailbox identity update must target a single mailbox id, got: ${where.trim()}`
		);
		assert.ok(
			!/eq\(mailboxes\.type, "personal"\)/u.test(where),
			"an update scoped by type fans the account name out to every personal mailbox"
		);
	}
	assert.match(sync, /tracksAccountIdentity/u);
});

test("the mailbox routes gate the account name on the identity check", () => {
	const detail = read("src/app/api/mailboxes/[id]/route.ts");
	assert.match(
		detail,
		/tracksAccountIdentity\(existing, user\.email\) && "displayName" in parsed\.data/u
	);
	assert.ok(
		!/existing\.type === "personal" && "displayName" in parsed\.data/u.test(
			detail
		),
		"PATCH must not treat every personal mailbox as the account identity"
	);

	const list = read("src/app/api/mailboxes/route.ts");
	assert.match(list, /tracksAccountIdentity\(mailbox, user\.email\)/u);
	assert.ok(
		!/mailbox\.type === "personal"\n?\s*\? \{ displayName: user\.name/u.test(
			list
		),
		"the list response must not overwrite every personal mailbox name with the account name"
	);
});

test("outgoing mail and message lists use the mailbox's own name", () => {
	const sender = read("src/lib/email/sender.ts");
	assert.match(
		sender,
		/resolveMailboxDisplayName\(mailbox, mailbox\.ownerEmail, mailbox\.ownerName\)/u
	);
	assert.ok(
		!/mailbox\.type === "personal" \? mailbox\.ownerName/u.test(sender),
		"every personal mailbox would send under the account owner's name"
	);

	const messages = read("src/app/api/messages/route.ts");
	assert.match(messages, /tracksAccountIdentity\(mailbox, user\.email\)/u);
});

test("the client only repaints the primary mailbox on profile changes", () => {
	const provider = read("src/components/mailbox-provider.tsx");
	assert.match(provider, /isIdentityMailbox\(mailbox\)/u);
	assert.ok(
		!/mailbox\.type === "personal" \? \{ \.\.\.mailbox, displayName: name \}/u.test(
			provider
		),
		"a profile rename must not relabel every personal mailbox in the sidebar"
	);

	const utils = read("src/components/mailbox-provider-utils.ts");
	assert.match(utils, /export function isIdentityMailbox/u);
});
