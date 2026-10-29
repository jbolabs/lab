import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "@/db";
import { contacts, domains, mailboxes, users } from "@/db/schema";
import { getContactId } from "@/lib/contacts/utils";
import { getMailboxDomainAddresses } from "@/lib/mailboxes/domain-addresses";

import { tracksAccountIdentity } from "./identity-utils";
import type { PersonalIdentity } from "./sync-types";

export async function syncPersonalIdentity(
	db: AppDatabase,
	identity: PersonalIdentity
): Promise<void> {
	await db
		.update(users)
		.set({ avatarKey: identity.avatarKey, name: identity.name })
		.where(eq(users.id, identity.userId));

	const [account] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, identity.userId))
		.limit(1);

	const personalMailboxes = await db
		.select({ hostname: domains.hostname, mailbox: mailboxes })
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.where(
			and(eq(mailboxes.userId, identity.userId), eq(mailboxes.type, "personal"))
		);

	for (const { mailbox, hostname } of personalMailboxes) {
		// Only the primary mailbox mirrors the profile. Secondary mailboxes keep
		// the name and avatar they were given.
		const isIdentityMailbox = tracksAccountIdentity(
			{ hostname, localPart: mailbox.localPart, type: mailbox.type },
			account?.email
		);
		if (isIdentityMailbox) {
			await db
				.update(mailboxes)
				.set({ avatarKey: identity.avatarKey, displayName: identity.name })
				.where(eq(mailboxes.id, mailbox.id));
		}
		const displayName = isIdentityMailbox
			? identity.name
			: (mailbox.displayName ?? identity.name);
		const avatarKey = isIdentityMailbox
			? identity.avatarKey
			: mailbox.avatarKey;

		for (const email of await getMailboxDomainAddresses(db, mailbox)) {
			await db
				.insert(contacts)
				.values({
					avatarKey,
					displayName,
					email,
					id: getContactId(identity.userId, email),
					source: "manual",
					userId: identity.userId,
				})
				.onConflictDoUpdate({
					set: {
						avatarKey,
						displayName,
						source: "manual",
					},
					target: [contacts.userId, contacts.email],
				});
		}
	}
}

export async function getPersonalIdentityForAddress(
	db: AppDatabase,
	userId: string,
	email: string
) {
	const [account] = await db
		.select({ avatarKey: users.avatarKey, name: users.name, userId: users.id })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!account) {
		return null;
	}

	const personalMailboxes = await db
		.select()
		.from(mailboxes)
		.where(and(eq(mailboxes.userId, userId), eq(mailboxes.type, "personal")));
	for (const mailbox of personalMailboxes) {
		const addresses = await getMailboxDomainAddresses(db, mailbox);
		if (addresses.includes(email)) {
			return account;
		}
	}
	return null;
}
