import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { domains, mailboxes, messages, outboundJobs, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { ensureBookingUsername } from "@/lib/booking/username";
import { upsertContactFromAddress } from "@/lib/contacts/service";
import { buildSnippet } from "@/lib/email/parse";
import { newId } from "@/lib/ids";
import { requireValue } from "@/lib/require-value";
import type {
	SeedMailboxKey,
	SeedMailboxMap,
	SeedMessageDefinition,
} from "@/lib/seed-types";

export const demoCredentials = {
	email: "admin@example.com",
	password: "demo-password-change-me",
};

const demoDomain = "example.com";

const seedMailboxDefinitions: {
	key: SeedMailboxKey;
	localPart: string;
	displayName: string;
}[] = [
	{ displayName: "Support", key: "support", localPart: "support" },
	{ displayName: "Billing", key: "billing", localPart: "billing" },
];

const seedMessages: SeedMessageDefinition[] = [
	{
		direction: "inbound",
		fromAddr: `"Maya Chen" <maya@acme.test>`,
		mailbox: "support",
		minutesAgo: 12,
		providerMessageId: "<seed-inbox-access@example.test>",
		read: false,
		status: "received",
		subject: "Cannot access workspace",
		textBody:
			"I reset my password this morning, but the login page still loops back to the sign-in screen. Can you check whether the account is locked?",
		toAddr: `"Support" <support@${demoDomain}>`,
	},
	{
		direction: "inbound",
		fromAddr: `"Northwind DevOps" <devops@northwind.test>`,
		mailbox: "support",
		minutesAgo: 47,
		providerMessageId: "<seed-inbox-webhook@example.test>",
		read: true,
		status: "received",
		subject: "Webhook retry question",
		textBody:
			"We noticed three delivery attempts for the same event. Is there a way to confirm whether retries stop after a 2xx response?",
		toAddr: `"Support" <support@${demoDomain}>`,
	},
	{
		direction: "inbound",
		fromAddr: `"Contoso Finance" <finance@contoso.test>`,
		mailbox: "billing",
		minutesAgo: 94,
		providerMessageId: "<seed-inbox-invoice@example.test>",
		read: false,
		status: "received",
		subject: "Invoice address update",
		textBody:
			"Please update our invoice contact to finance-team@contoso.test before the next billing cycle closes.",
		toAddr: `"Billing" <billing@${demoDomain}>`,
	},
	{
		direction: "outbound",
		fromAddr: `"Support" <support@${demoDomain}>`,
		mailbox: "support",
		minutesAgo: 8,
		providerMessageId: "<seed-sent-access@example.test>",
		read: true,
		status: "sent",
		subject: "Re: Cannot access workspace",
		textBody:
			"I cleared the stale session and sent a fresh password reset link. Please try again from an incognito window.",
		toAddr: `"Maya Chen" <maya@acme.test>`,
	},
	{
		direction: "outbound",
		fromAddr: `"Billing" <billing@${demoDomain}>`,
		mailbox: "billing",
		minutesAgo: 35,
		providerMessageId: "<seed-sent-invoice@example.test>",
		read: true,
		status: "sent",
		subject: "Re: Invoice address update",
		textBody:
			"The billing contact is updated. Future invoices will go to finance-team@contoso.test.",
		toAddr: `"Contoso Finance" <finance@contoso.test>`,
	},
	{
		direction: "outbound",
		fromAddr: `"Support" <support@${demoDomain}>`,
		mailbox: "support",
		minutesAgo: 22,
		read: true,
		status: "draft",
		subject: "Re: Webhook retry question",
		textBody:
			"Draft note: include retry backoff details, delivery log location, and the recommendation to return HTTP 204 after processing.",
		toAddr: `"Northwind DevOps" <devops@northwind.test>`,
	},
	{
		direction: "outbound",
		fromAddr: `"Billing" <billing@${demoDomain}>`,
		mailbox: "billing",
		minutesAgo: 128,
		read: true,
		status: "draft",
		subject: "Annual plan renewal",
		textBody:
			"Draft renewal response with seat count, purchase order reference, and requested renewal date.",
		toAddr: `"Globex Procurement" <procurement@globex.test>`,
	},
	{
		direction: "inbound",
		fromAddr: `"Traffic Promotions" <promo@unknown-sender.test>`,
		mailbox: "support",
		minutesAgo: 166,
		providerMessageId: "<seed-spam-promo@example.test>",
		read: false,
		status: "spam",
		subject: "Urgent traffic boost offer",
		textBody:
			"We can send thousands of visitors to your dashboard today. Reply now for the limited campaign rate.",
		toAddr: `"Support" <support@${demoDomain}>`,
	},
	{
		direction: "inbound",
		fromAddr: `"Fake Bank Alerts" <alerts@fake-bank.test>`,
		mailbox: "billing",
		minutesAgo: 219,
		providerMessageId: "<seed-spam-bank@example.test>",
		read: true,
		status: "spam",
		subject: "Payment account verification required",
		textBody:
			"Your payout account requires verification. Open the attached link and confirm your banking credentials.",
		toAddr: `"Billing" <billing@${demoDomain}>`,
	},
	{
		direction: "inbound",
		fromAddr: `"Vendor Migration" <old-thread@vendor.test>`,
		mailbox: "support",
		minutesAgo: 266,
		providerMessageId: "<seed-trash-migration@example.test>",
		read: true,
		status: "trash",
		subject: "Legacy migration thread",
		textBody:
			"This message was moved to trash after the migration checklist was completed and archived.",
		toAddr: `"Support" <support@${demoDomain}>`,
	},
	{
		direction: "outbound",
		fromAddr: `"Billing" <billing@${demoDomain}>`,
		mailbox: "billing",
		minutesAgo: 314,
		read: true,
		status: "trash",
		subject: "Old billing draft",
		textBody:
			"Discarded copy of an earlier billing reply that was replaced by the final invoice response.",
		toAddr: `"Initech Ops" <ops@initech.test>`,
	},
	{
		direction: "outbound",
		fromAddr: `"Support" <support@${demoDomain}>`,
		mailbox: "support",
		minutesAgo: 4,
		read: true,
		status: "queued",
		subject: "Queued delivery status",
		textBody:
			"This seeded message represents an outbound email waiting for the worker queue to process.",
		toAddr: `"Customer Status" <status@customer.test>`,
	},
	{
		direction: "outbound",
		fromAddr: `"Billing" <billing@${demoDomain}>`,
		mailbox: "billing",
		minutesAgo: 17,
		read: true,
		status: "queued",
		subject: "Queued payment receipt",
		textBody:
			"This seeded receipt is queued so API and background-job views can exercise pending delivery states.",
		toAddr: `"Umbrella AP" <ap@umbrella.test>`,
	},
	{
		direction: "outbound",
		fromAddr: `"Support" <support@${demoDomain}>`,
		mailbox: "support",
		minutesAgo: 73,
		read: true,
		status: "failed",
		subject: "Failed SMTP handoff",
		textBody:
			"This seeded message failed delivery after the provider rejected the recipient address.",
		toAddr: `"Invalid Bounce" <bounce@invalid.test>`,
	},
	{
		direction: "outbound",
		fromAddr: `"Billing" <billing@${demoDomain}>`,
		mailbox: "billing",
		minutesAgo: 181,
		read: true,
		status: "failed",
		subject: "Failed billing notice",
		textBody:
			"This seeded billing notice failed because the destination mailbox no longer exists.",
		toAddr: `"Closed Partner Account" <closed-account@partner.test>`,
	},
];

export async function ensureDemoUser(env: CloudflareEnv) {
	const db = getDb(env);
	const [existing] = await db
		.select()
		.from(users)
		.where(eq(users.email, demoCredentials.email))
		.limit(1);
	const [admin] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.role, "admin"))
		.limit(1);
	if (existing) {
		// Repair demos seeded before the login page required an admin account.
		if (!admin) {
			await db
				.update(users)
				.set({ isPrimaryAdmin: true, role: "admin" })
				.where(eq(users.id, existing.id));
			return { ...existing, isPrimaryAdmin: true, role: "admin" as const };
		}
		return existing;
	}

	const id = newId("usr");
	await db.insert(users).values({
		email: demoCredentials.email,
		id,
		isPrimaryAdmin: !admin,
		name: "Demo User",
		passwordHash: hashPassword(demoCredentials.password),
		role: admin ? "user" : "admin",
	});
	await ensureBookingUsername(env, id, demoCredentials.email);

	const [created] = await db
		.select()
		.from(users)
		.where(eq(users.id, id))
		.limit(1);
	return requireValue(created);
}

export async function ensureDemoDomain(env: CloudflareEnv, userId: string) {
	const db = getDb(env);
	const [existing] = await db
		.select()
		.from(domains)
		.where(eq(domains.hostname, demoDomain))
		.limit(1);
	if (existing) {
		return existing;
	}

	const id = newId("dom");
	await db.insert(domains).values({
		hostname: demoDomain,
		id,
		routingEnabled: true,
		sendingEnabled: true,
		sendingProvider: "cloudflare" as const,
		sendingRequested: true,
		status: "active",
		userId,
		zoneId: "00000000000000000000000000000000",
	});

	const [created] = await db
		.select()
		.from(domains)
		.where(eq(domains.id, id))
		.limit(1);
	return requireValue(created);
}

export async function ensureDemoMailboxes(
	env: CloudflareEnv,
	userId: string,
	domainId: string
): Promise<SeedMailboxMap> {
	const db = getDb(env);
	const entries = await Promise.all(
		seedMailboxDefinitions.map(async (definition) => {
			const [existing] = await db
				.select()
				.from(mailboxes)
				.where(
					and(
						eq(mailboxes.domainId, domainId),
						eq(mailboxes.localPart, definition.localPart)
					)
				)
				.limit(1);
			if (existing) {
				return [definition.key, existing] as const;
			}

			const id = newId("mbx");
			await db.insert(mailboxes).values({
				displayName: definition.displayName,
				domainId,
				id,
				localPart: definition.localPart,
				userId,
			});

			const [created] = await db
				.select()
				.from(mailboxes)
				.where(eq(mailboxes.id, id))
				.limit(1);
			return [definition.key, requireValue(created)] as const;
		})
	);

	return Object.fromEntries(entries) as SeedMailboxMap;
}

export async function insertDemoMessages(
	env: CloudflareEnv,
	userId: string,
	mailboxMap: SeedMailboxMap
): Promise<number> {
	const db = getDb(env);
	const now = Date.now();

	for (const seedMessage of seedMessages) {
		const id = newId("msg");
		const createdAt = new Date(now - seedMessage.minutesAgo * 60 * 1000);
		const mailbox = mailboxMap[seedMessage.mailbox];

		await db.insert(messages).values({
			createdAt,
			direction: seedMessage.direction,
			fromAddr: seedMessage.fromAddr,
			htmlBody: null,
			id,
			mailboxId: mailbox.id,
			providerMessageId: seedMessage.providerMessageId ?? null,
			read: seedMessage.read ?? true,
			snippet: buildSnippet(seedMessage.textBody, null),
			status: seedMessage.status,
			subject: seedMessage.subject,
			textBody: seedMessage.textBody,
			threadId: seedMessage.providerMessageId ?? null,
			toAddr: seedMessage.toAddr,
			userId,
		});

		if (seedMessage.status === "queued" || seedMessage.status === "failed") {
			await db.insert(outboundJobs).values({
				createdAt,
				error:
					seedMessage.status === "failed"
						? "Seeded delivery failure for UI and API testing"
						: null,
				id: newId("job"),
				messageId: id,
				payload: JSON.stringify({
					from: seedMessage.fromAddr,
					subject: seedMessage.subject,
					text: seedMessage.textBody,
					to: seedMessage.toAddr,
				}),
				status: seedMessage.status,
				updatedAt: createdAt,
				userId,
			});
		}

		await upsertContactFromAddress(env, {
			address:
				seedMessage.direction === "inbound"
					? seedMessage.fromAddr
					: seedMessage.toAddr,
			source: seedMessage.direction === "inbound" ? "inbound" : "outbound",
			userId,
		});
	}

	return seedMessages.length;
}
