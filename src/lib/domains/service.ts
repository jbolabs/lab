import { eq, and, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { domains, mailboxes } from "@/db/schema";
import {
	disableEmailRouting,
	getEmailRoutingDns,
	getEmailRoutingSettings,
	getSendingSubdomainDns,
	deleteSendingSubdomain,
	listSendingSubdomains,
} from "@/lib/cloudflare-api";
import type { CfDnsRecord } from "@/lib/cloudflare-api";
import { deleteEmailRoutingRulesForDomain } from "@/lib/domains/cloudflare-cleanup";
import { getManualDomainDns } from "@/lib/domains/manual-dns";
import { preflightDomain } from "@/lib/domains/preflight";
import {
	isManualZone,
	provisionDomainOnCloudflare,
} from "@/lib/domains/provision";
import { rollbackDomainProvisioning } from "@/lib/domains/rollback";
import { findSendingSubdomain } from "@/lib/domains/sending-status";
import type { DomainProvisioningChanges } from "@/lib/domains/types";
import { newId } from "@/lib/ids";
import { ensureMailboxDomainRouting } from "@/lib/mailboxes/domain-addresses";
import { requireValue } from "@/lib/require-value";
import { hasCloudflareCredentials } from "@/lib/runtime";

export async function listUserDomains(env: CloudflareEnv, userId: string) {
	const db = getDb(env);
	return await db.select().from(domains).where(eq(domains.userId, userId));
}

export interface DomainDnsView {
	routing: { records: CfDnsRecord[]; missing: CfDnsRecord[]; status?: string };
	sending: CfDnsRecord[];
	sendingEnabled: boolean;
	/** DKIM selector Cloudflare signs with, when a sending subdomain exists. */
	dkimSelector?: string;
	/** The matching sending subdomain, when the zone has the domain added for sending. */
	sendingSubdomain?: { name: string; tag: string };
}

export async function getDomainDns(
	env: CloudflareEnv,
	domain: typeof domains.$inferSelect
): Promise<DomainDnsView> {
	if (isManualZone(domain.zoneId)) {
		return getManualDomainDns(env, domain.hostname);
	}
	// Read the zone's actual sending state rather than trusting `sendingRequested`,
	// which goes stale when sending is enabled outside Mailflare (or when the row
	// was written before the subdomain existed). A missing Email Sending permission
	// must not take down the routing/DNS view, so a failed list degrades to none.
	const [routingDns, routingSettings, sendingSubdomains] = await Promise.all([
		getEmailRoutingDns(env, domain.zoneId),
		getEmailRoutingSettings(env, domain.zoneId),
		listSendingSubdomains(env, domain.zoneId).catch((error) => {
			console.warn("getDomainDns: failed to list sending subdomains", error);
			return [];
		}),
	]);
	const sendingSubdomain = findSendingSubdomain(
		domain.hostname,
		sendingSubdomains
	);
	let sending: CfDnsRecord[] = [];
	if (sendingSubdomain?.tag) {
		sending = await getSendingSubdomainDns(
			env,
			domain.zoneId,
			sendingSubdomain.tag
		).catch((error) => {
			console.warn("getDomainDns: failed to read sending subdomain DNS", error);
			return [];
		});
	}
	return {
		dkimSelector: sendingSubdomain?.dkim_selector,
		routing: {
			missing: routingDns.missing,
			records: routingDns.records,
			status: routingSettings.status,
		},
		sending,
		sendingEnabled: sendingSubdomain?.enabled ?? false,
		sendingSubdomain: sendingSubdomain
			? { name: sendingSubdomain.name, tag: sendingSubdomain.tag }
			: undefined,
	};
}

export async function addDomainForUser(
	env: CloudflareEnv,
	userId: string,
	hostname: string,
	options?: {
		enableRouting?: boolean;
		enableSending?: boolean;
		replaceMxRecords?: boolean;
		skipDns?: boolean;
		receivingProvider?: "none" | "cloudflare" | "resend" | "ses";
		sendingProvider?: "none" | "cloudflare" | "resend" | "ses";
	}
): Promise<{
	domain: typeof domains.$inferSelect;
	dns: DomainDnsView;
	changes: DomainProvisioningChanges;
}> {
	const db = getDb(env);
	const normalizedHostname = hostname.toLowerCase().trim();
	const [claimedHostname] = await db
		.select({ userId: domains.userId })
		.from(domains)
		.where(eq(domains.hostname, normalizedHostname))
		.limit(1);
	if (claimedHostname && claimedHostname.userId !== userId) {
		throw new Error("Domain is already registered");
	}
	if (!options?.skipDns && hasCloudflareCredentials(env)) {
		const { zone } = await preflightDomain(env, normalizedHostname);
		const [claimedZone] = await db
			.select({ userId: domains.userId })
			.from(domains)
			.where(and(eq(domains.zoneId, zone.id), ne(domains.userId, userId)))
			.limit(1);
		if (claimedZone) {
			throw new Error(
				"Cloudflare zone is already registered to another account"
			);
		}
	}
	// Email Routing is Cloudflare's way of receiving; another provider brings its own MX,
	// which its setup in the domain page creates once credentials exist.
	// A skipped-DNS domain is recorded only: nothing receives or sends until the operator picks providers.
	const skipDns = options?.skipDns === true;
	const receivingProvider = skipDns
		? "none"
		: (options?.receivingProvider ?? "cloudflare");
	// Cloudflare's sending subdomain is only provisioned when Cloudflare is the sender.
	const resolveRequestedSending = () =>
		skipDns
			? "none"
			: (options?.sendingProvider ??
				(options?.enableSending === false ? "none" : "cloudflare"));
	const requestedSending = resolveRequestedSending();
	const provisioned = await provisionDomainOnCloudflare(env, hostname, {
		...options,
		enableRouting:
			receivingProvider === "cloudflare"
				? (options?.enableRouting ?? true)
				: false,
		enableSending: requestedSending === "cloudflare",
		replaceMxRecords:
			receivingProvider === "cloudflare" ? options?.replaceMxRecords : false,
	});
	const persistProvisionedDomain = async (): Promise<{
		domain: typeof domains.$inferSelect;
		dns: DomainDnsView;
		changes: DomainProvisioningChanges;
	}> => {
		let insertedDomainId: string | null = null;
		let domain: typeof domains.$inferSelect;

		try {
			const [existing] = await db
				.select()
				.from(domains)
				.where(eq(domains.hostname, provisioned.hostname))
				.limit(1);
			if (existing && existing.userId !== userId) {
				throw new Error("Domain is already registered");
			}

			const domainId = existing?.id ?? newId("dom");
			const buildDomainValues = () => ({
				dnsSkipped: options?.skipDns === true,

				hostname: provisioned.hostname,

				id: domainId,

				receivingProvider,

				routingEnabled: skipDns ? false : provisioned.routingEnabled,

				routingStatus: provisioned.routingStatus ?? null,

				sendingEnabled: skipDns ? false : provisioned.sendingEnabled,

				sendingRequested: skipDns ? false : provisioned.sendingRequested,

				sendingSubdomainTag: provisioned.sendingSubdomainTag,

				...(() => {
					if (skipDns) {
						return { sendingProvider: "none" as const };
					}
					if (options?.sendingProvider) {
						return { sendingProvider: options.sendingProvider };
					}
					if (existing && existing.sendingProvider !== "none") {
						return {};
					}
					return {
						sendingProvider: provisioned.sendingRequested
							? ("cloudflare" as const)
							: ("none" as const),
					};
				})(),

				status:
					!skipDns &&
					(provisioned.routingEnabled ||
						provisioned.sendingEnabled ||
						receivingProvider !== "cloudflare")
						? ("active" as const)
						: ("pending" as const),

				userId,

				zoneId: provisioned.zone.id,
			});
			const values = buildDomainValues();

			if (existing) {
				await db.update(domains).set(values).where(eq(domains.id, domainId));
			} else {
				await db.insert(domains).values(values);
				insertedDomainId = domainId;
			}

			const aliasMailboxes = await db
				.select({
					domainId: mailboxes.domainId,
					id: mailboxes.id,
					localPart: mailboxes.localPart,
					useAllDomains: mailboxes.useAllDomains,
				})
				.from(mailboxes)
				.innerJoin(domains, eq(mailboxes.domainId, domains.id))
				.where(
					and(eq(domains.userId, userId), eq(mailboxes.useAllDomains, true))
				);
			const routingResults = await Promise.allSettled(
				aliasMailboxes.map((mailbox) =>
					ensureMailboxDomainRouting(env, db, mailbox)
				)
			);
			for (const result of routingResults) {
				if (result.status === "rejected") {
					console.warn("ensureMailboxDomainRouting", result.reason);
				}
			}

			const [row] = await db
				.select()
				.from(domains)
				.where(eq(domains.id, domainId))
				.limit(1);
			domain = requireValue(row);
		} catch (error) {
			// The zone was already provisioned above. Anything that fails after that —
			// a hostname owned by another user, an unmigrated D1 schema — would otherwise
			// strand Email Routing and the sending subdomain with nothing referencing them.
			await rollbackDomainProvisioning(env, provisioned.changes);
			if (insertedDomainId) {
				try {
					await db.delete(domains).where(eq(domains.id, insertedDomainId));
				} catch (cleanupError) {
					console.warn(
						"addDomainForUser: failed to remove partial domain row",
						cleanupError
					);
				}
			}
			throw error;
		}

		// Read the DNS view outside the rollback scope: the domain is fully set up by
		// now, so a failed status read must not tear it back down or make registration
		// delete the account that now owns the completed Cloudflare configuration.
		let dns: DomainDnsView;
		try {
			dns = await getDomainDns(env, domain);
		} catch (error) {
			console.warn(
				"addDomainForUser: failed to read DNS status after provisioning",
				error
			);
			dns = {
				routing: {
					missing: [],
					records: [],
					status: provisioned.routingStatus,
				},
				sending: [],
				sendingEnabled: provisioned.sendingEnabled,
			};
		}
		return { changes: provisioned.changes, dns, domain };
	};
	return await persistProvisionedDomain();
}

export async function removeDomainForUser(
	env: CloudflareEnv,
	userId: string,
	domainId: string
): Promise<void> {
	const db = getDb(env);
	const [domain] = await db
		.select()
		.from(domains)
		.where(and(eq(domains.id, domainId), eq(domains.userId, userId)))
		.limit(1);
	if (!domain) {
		throw new Error("Domain not found");
	}

	try {
		await deleteEmailRoutingRulesForDomain(env, domain.zoneId, domain.hostname);
	} catch (error) {
		console.warn("deleteEmailRoutingRulesForDomain", error);
	}

	const [otherDomainOnZone] = await db
		.select({ id: domains.id })
		.from(domains)
		.where(and(eq(domains.zoneId, domain.zoneId), ne(domains.id, domainId)))
		.limit(1);
	if (domain.routingEnabled && !otherDomainOnZone) {
		try {
			await disableEmailRouting(env, domain.zoneId);
		} catch (error) {
			console.warn("disableEmailRouting", error);
		}
	}

	if (domain.sendingSubdomainTag) {
		try {
			await deleteSendingSubdomain(
				env,
				domain.zoneId,
				domain.sendingSubdomainTag
			);
		} catch (error) {
			console.warn("deleteSendingSubdomain", error);
		}
	}

	await db.delete(domains).where(eq(domains.id, domainId));
}

export async function getDomainForUser(
	env: CloudflareEnv,
	userId: string,
	domainId: string
) {
	const db = getDb(env);
	const [domain] = await db
		.select()
		.from(domains)
		.where(and(eq(domains.id, domainId), eq(domains.userId, userId)))
		.limit(1);
	return domain ?? null;
}
