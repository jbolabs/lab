import { and, asc, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { domains, mailboxes, users } from "@/db/schema";
import { APP_NAME } from "@/lib/app-identity";
import { formatEmailAddress } from "@/lib/email/address";
import {
	getOutboundProviderConfig,
	sendThroughProvider,
} from "@/lib/email/outbound-provider";
import type { SystemMailInput } from "@/lib/email/system-mail-types";

export async function pickSystemSender(
	env: CloudflareEnv,
	hostname?: string
): Promise<{ address: string; name: string } | null> {
	const db = getDb(env);
	const rows = await db
		.select({
			cloudflareSending: domains.sendingEnabled,
			displayName: mailboxes.displayName,
			hostname: domains.hostname,
			localPart: mailboxes.localPart,
			provider: domains.sendingProvider,
			role: users.role,
		})
		.from(mailboxes)
		.innerJoin(domains, eq(mailboxes.domainId, domains.id))
		.innerJoin(users, eq(mailboxes.userId, users.id))
		.where(
			and(
				ne(domains.sendingProvider, "none"),
				...(hostname ? [eq(domains.hostname, hostname.toLowerCase())] : []),
				eq(mailboxes.disabled, false),
				eq(users.disabled, false)
			)
		)
		.orderBy(asc(mailboxes.createdAt))
		.limit(50);
	// Cloudflare sending only works once the zone's sending subdomain is enabled;
	// Resend is verified per domain in Resend itself.
	const usable = rows.filter(
		(row) => row.provider !== "cloudflare" || row.cloudflareSending
	);
	const chosen = usable.find((row) => row.role === "admin") ?? usable[0];
	if (!chosen) {
		return null;
	}
	return {
		address: `${chosen.localPart}@${chosen.hostname}`,
		name: chosen.displayName ?? APP_NAME,
	};
}

/**
 * Mail the application sends on its own behalf (password resets). It goes
 * straight through the send binding: no Sent copy, no contact upsert, no
 * webhooks, and the auto-generated headers mail systems expect.
 *
 * The From address is the primary mailbox of the first administrator on a
 * domain that can send; if no domain has sending enabled there is nothing to
 * send from, and the caller decides what to tell the user.
 */
export async function sendSystemEmail(
	env: CloudflareEnv,
	input: SystemMailInput
): Promise<boolean> {
	const sender = await pickSystemSender(env, input.hostname);
	if (!sender) {
		return false;
	}

	const from = formatEmailAddress(sender.address, sender.name);
	await sendThroughProvider(env, await getOutboundProviderConfig(env, from), {
		from,
		headers: {
			"Auto-Submitted": "auto-generated",
			"X-Auto-Response-Suppress": "All",
		},
		html: input.html,
		subject: input.subject,
		text: input.text,
		to: [input.to],
	});
	return true;
}
