import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { normalizeEmailAddress } from "@/lib/email/address";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";
import {
	getPersonalIdentityForAddress,
	syncPersonalIdentity,
} from "@/lib/profile/sync";

import type { ContactRequestInput } from "./types";
import {
	getContactByEmail,
	saveManualContactName,
	toContactDetails,
} from "./utils";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	const url = new URL(request.url);
	const mailboxId = url.searchParams.get("mailboxId");
	const email = normalizeEmailAddress(url.searchParams.get("address") ?? "");
	if (!mailboxId || !email) {
		return Response.json(
			{ error: "Mailbox and contact are required" },
			{ status: 400 }
		);
	}

	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, mailboxId);
	if (!access?.canRead) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}
	const storedContact = toContactDetails(
		await getContactByEmail(db, access.mailbox.userId, email)
	);
	const account = await getPersonalIdentityForAddress(
		db,
		access.mailbox.userId,
		email
	);
	const contact = account
		? {
				...storedContact,
				blocked: storedContact?.blocked ?? false,
				displayName: account.name,
				email,
				hasAvatar: !!account.avatarKey,
				lastSeenAt: storedContact?.lastSeenAt ?? null,
				source: "manual" as const,
			}
		: storedContact;
	return Response.json({
		contact: contact ?? {
			blocked: false,
			displayName: null,
			email,
			hasAvatar: false,
			lastSeenAt: null,
			source: null,
		},
	});
}

export async function PATCH(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	const body = (await request.json()) as ContactRequestInput;
	const email = normalizeEmailAddress(body.address ?? "");
	const displayName = body.displayName?.trim() ?? "";
	if (!body.mailboxId || !email || !displayName || displayName.length > 100) {
		return Response.json(
			{ error: "A valid contact name is required" },
			{ status: 400 }
		);
	}

	const db = getDb(env);
	const access = await getMailboxAccessLevel(db, user, body.mailboxId);
	if (!access?.canManage) {
		return Response.json({ error: "Mailbox not found" }, { status: 404 });
	}
	const account = await getPersonalIdentityForAddress(
		db,
		access.mailbox.userId,
		email
	);
	if (account) {
		if (account.userId !== user.id) {
			return Response.json(
				{ error: "Only the account owner can change this contact" },
				{ status: 403 }
			);
		}
		await syncPersonalIdentity(db, {
			avatarKey: account.avatarKey,
			name: displayName,
			userId: account.userId,
		});
	}
	const contact = toContactDetails(
		await saveManualContactName(db, {
			displayName,
			email,
			userId: access.mailbox.userId,
		})
	);
	return Response.json({ contact });
}
