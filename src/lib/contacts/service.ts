import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { contacts, routingRules } from "@/db/schema";
import { importGravatarAvatar } from "@/lib/contacts/gravatar";
import type {
	BlockContactInput,
	ContactInput,
	MessageContactNames,
} from "@/lib/contacts/types";
import { getContactId, getContactNameFromAddress } from "@/lib/contacts/utils";
import {
	getFirstEmailAddressEntry,
	normalizeEmailAddress,
} from "@/lib/email/address";
import { requireValue } from "@/lib/require-value";

function getNextDisplayName(
	existingName: string | null,
	source: string,
	nextName: string | null
): string | null {
	if (source === "manual") {
		return existingName;
	}
	if (nextName) {
		return nextName;
	}
	return existingName;
}

export async function upsertContactFromAddress(
	env: CloudflareEnv,
	input: ContactInput
) {
	const email = normalizeEmailAddress(input.address);
	if (!email) {
		return null;
	}

	const displayName = getContactNameFromAddress(input.address);
	const db = getDb(env);
	const [existing] = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.userId, input.userId), eq(contacts.email, email)))
		.limit(1);
	const now = new Date();

	if (existing) {
		const nextDisplayName = getNextDisplayName(
			existing.displayName,
			existing.source,
			displayName
		);
		const nextSource =
			existing.source === "manual" ||
			(existing.source === "outbound" && input.source === "inbound")
				? existing.source
				: input.source;

		await db
			.update(contacts)
			.set({
				displayName: nextDisplayName,
				lastSeenAt: now,
				source: nextSource,
			})
			.where(eq(contacts.id, existing.id));
		return {
			...existing,
			displayName: nextDisplayName,
			lastSeenAt: now,
			source: nextSource,
		};
	}

	const id = getContactId(input.userId, email);
	await db.insert(contacts).values({
		displayName,
		email,
		id,
		lastSeenAt: now,
		source: input.source,
		userId: input.userId,
	});
	const avatarKey = await importGravatarAvatar(env, input.userId, email);
	if (avatarKey) {
		await db.update(contacts).set({ avatarKey }).where(eq(contacts.id, id));
	}

	const [created] = await db
		.select()
		.from(contacts)
		.where(eq(contacts.id, id))
		.limit(1);
	return created ?? null;
}

export async function getContactDisplayNameMap(
	env: CloudflareEnv,
	userId: string,
	addresses: string[]
) {
	const emails = [
		...new Set(addresses.map(normalizeEmailAddress).filter(Boolean)),
	];
	if (emails.length === 0) {
		return new Map<string, string>();
	}

	const db = getDb(env);
	const rows = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.userId, userId), inArray(contacts.email, emails)));

	return new Map(
		rows
			.filter((contact) => !!contact.displayName)
			.map((contact) => [contact.email, requireValue(contact.displayName)])
	);
}

export async function getContactAvatarMap(
	env: CloudflareEnv,
	userId: string,
	addresses: string[]
) {
	const emails = [
		...new Set(addresses.map(normalizeEmailAddress).filter(Boolean)),
	];
	if (emails.length === 0) {
		return new Map<string, boolean>();
	}

	const db = getDb(env);
	const rows = await db
		.select({ avatarKey: contacts.avatarKey, email: contacts.email })
		.from(contacts)
		.where(and(eq(contacts.userId, userId), inArray(contacts.email, emails)));

	return new Map(rows.map((contact) => [contact.email, !!contact.avatarKey]));
}

export async function getMessageContactNames(
	env: CloudflareEnv,
	userId: string,
	fromAddr: string,
	toAddr: string
): Promise<MessageContactNames> {
	// `toAddr` may be a full recipient list; the name shown belongs to the first one.
	const firstTo = getFirstEmailAddressEntry(toAddr);
	const contactMap = await getContactDisplayNameMap(env, userId, [
		fromAddr,
		firstTo,
	]);

	return {
		fromContactName: contactMap.get(normalizeEmailAddress(fromAddr)) ?? null,
		toContactName: contactMap.get(normalizeEmailAddress(firstTo)) ?? null,
	};
}

export async function blockContact(
	env: CloudflareEnv,
	input: BlockContactInput
) {
	const email = normalizeEmailAddress(input.address);
	if (!email) {
		throw new Error("Contact email is required");
	}

	const db = getDb(env);
	const contactId = getContactId(input.userId, email);
	const [existingContact] = await db
		.select()
		.from(contacts)
		.where(and(eq(contacts.userId, input.userId), eq(contacts.email, email)))
		.limit(1);
	if (existingContact) {
		await db
			.update(contacts)
			.set({ blocked: true })
			.where(eq(contacts.id, existingContact.id));
	} else {
		await db.insert(contacts).values({
			blocked: true,
			displayName: getContactNameFromAddress(input.address),
			email,
			id: contactId,
			lastSeenAt: new Date(),
			source: "inbound",
			userId: input.userId,
		});
		const avatarKey = await importGravatarAvatar(env, input.userId, email);
		if (avatarKey) {
			await db
				.update(contacts)
				.set({ avatarKey })
				.where(eq(contacts.id, contactId));
		}
	}

	const [existingRule] = await db
		.select()
		.from(routingRules)
		.where(
			and(
				eq(routingRules.mailboxId, input.mailboxId),
				eq(routingRules.matchField, "email"),
				eq(routingRules.matchOperator, "exact"),
				eq(routingRules.matchValue, email),
				eq(routingRules.action, "trash")
			)
		)
		.limit(1);
	if (!existingRule) {
		await db.insert(routingRules).values({
			action: "trash",
			domainId: input.domainId,
			id: `block:${input.mailboxId}:${email}`,
			mailboxId: input.mailboxId,
			matchField: "email",
			matchOperator: "exact",
			matchValue: email,
			pattern: email,
			priority: 100,
			userId: input.userId,
		});
	}

	return { blocked: true, email };
}
