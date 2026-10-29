import { eq, and, asc, desc } from "drizzle-orm";

import type { AppDatabase } from "@/db";
import {
	domains,
	folders,
	mailboxAliases,
	mailboxes,
	routingRules,
} from "@/db/schema";
import { getEmailAddress } from "@/lib/email/address";
import {
	normalizeRecipientLocalPart,
	parseRecipientAddress,
} from "@/lib/email/recipient-address";
import { compileRulePattern } from "@/lib/email/rule-pattern";
import { getMailboxDomainAddresses } from "@/lib/mailboxes/domain-addresses";

type RuleRow = typeof routingRules.$inferSelect;

async function listDomainRules(
	db: AppDatabase,
	domainId: string
): Promise<RuleRow[]> {
	return await db
		.select()
		.from(routingRules)
		.where(
			and(
				eq(routingRules.domainId, domainId),
				eq(routingRules.scope, "domain"),
				eq(routingRules.enabled, true)
			)
		)
		.orderBy(desc(routingRules.priority), asc(routingRules.createdAt));
}

function normalizeRuleComparisonValue(
	field: string | null | undefined,
	value: string | null | undefined
): string {
	if (!value) {
		return "";
	}
	if (field === "email" || field === "sender" || field === "recipient") {
		return getEmailAddress(value).trim().toLowerCase();
	}
	return value.toLowerCase();
}

export interface RuleMatchInput {
	toAddress: string;
	fromAddress?: string | null;
	subject?: string | null;
	content?: string | null;
}

function getRuleFieldValues(
	field: string | null | undefined,
	input: RuleMatchInput
) {
	if (field === "content") {
		return [input.content];
	}
	if (field === "title") {
		return [input.subject];
	}
	if (field === "sender") {
		return [input.fromAddress];
	}
	if (field === "recipient") {
		return [input.toAddress];
	}
	return [input.fromAddress, input.toAddress];
}

/**
 * Rule patterns are operator-authored but still untrusted enough to warrant guarding:
 * an invalid pattern must not throw and take down inbound processing.
 */
function matchesRegex(value: string, pattern: string): boolean {
	try {
		return compileRulePattern(pattern, "i").test(value);
	} catch {
		return false;
	}
}

function compareRuleValue(
	operator: string | null | undefined,
	value: string,
	ruleValue: string,
	rawRuleValue: string
): boolean {
	switch (operator) {
		case "exact": {
			return value === ruleValue;
		}
		case "starts_with": {
			return value.startsWith(ruleValue);
		}
		case "ends_with": {
			return value.endsWith(ruleValue);
		}
		case "regex": {
			return matchesRegex(value, rawRuleValue);
		}
		default: {
			return value.includes(ruleValue);
		}
	}
}

interface MatchableRule {
	pattern: string;
	matchField?: string | null;
	matchOperator?: string | null;
	matchValue?: string | null;
}

export function matchesRule(
	rule: MatchableRule,
	input: RuleMatchInput
): boolean {
	const rawValue = (rule.matchValue || rule.pattern).trim();
	// "*" is the catch-all pattern used by catch-all and block-everything rules.
	if (rawValue === "*") {
		return true;
	}
	const normalizedRuleValue = normalizeRuleComparisonValue(
		rule.matchField,
		rawValue
	);
	if (!normalizedRuleValue) {
		return false;
	}

	const values = getRuleFieldValues(rule.matchField, input);
	return values.some((value) => {
		if (!value) {
			return false;
		}
		const normalizedValue = normalizeRuleComparisonValue(
			rule.matchField,
			value
		);
		if (!normalizedValue) {
			return false;
		}
		return compareRuleValue(
			rule.matchOperator,
			normalizedValue,
			normalizedRuleValue,
			rawValue
		);
	});
}

async function resolveMailboxAlias(
	db: AppDatabase,
	domainId: string,
	localPart: string
) {
	const rows = await db
		.select({ aliasLocalPart: mailboxAliases.localPart, mailbox: mailboxes })
		.from(mailboxAliases)
		.innerJoin(mailboxes, eq(mailboxAliases.mailboxId, mailboxes.id))
		.where(
			and(eq(mailboxAliases.domainId, domainId), eq(mailboxes.disabled, false))
		);
	const row = rows.find(
		(item) => normalizeRecipientLocalPart(item.aliasLocalPart) === localPart
	);
	return row?.mailbox ?? null;
}

async function resolveMailboxDomainAlias(
	db: AppDatabase,
	localPart: string,
	normalizedAddress: string
) {
	const candidates = await db
		.select()
		.from(mailboxes)
		.where(
			and(eq(mailboxes.useAllDomains, true), eq(mailboxes.disabled, false))
		);

	for (const mailbox of candidates) {
		if (normalizeRecipientLocalPart(mailbox.localPart) !== localPart) {
			continue;
		}
		const addresses = await getMailboxDomainAddresses(db, mailbox);
		if (
			addresses.some(
				(address) =>
					parseRecipientAddress(address)?.normalizedAddress ===
					normalizedAddress
			)
		) {
			return mailbox;
		}
	}
	return null;
}

export interface ResolvedMailbox {
	mailboxId: string;
	folderId: string | null;
	userId: string;
	domainId: string;
	localPart: string;
	hostname: string;
	displayName: string | null;
}

function toResolvedMailbox(
	mailbox: typeof mailboxes.$inferSelect,
	domainId: string,
	hostname: string
): ResolvedMailbox {
	return {
		displayName: mailbox.displayName,
		domainId,
		folderId: null,
		hostname,
		localPart: mailbox.localPart,
		mailboxId: mailbox.id,
		userId: mailbox.userId,
	};
}

async function getRuleMailbox(
	db: AppDatabase,
	mailboxId: string,
	domainId: string
): Promise<ResolvedMailbox | null> {
	const [mailbox] = await db
		.select()
		.from(mailboxes)
		.where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.disabled, false)))
		.limit(1);
	if (!mailbox) {
		return null;
	}

	const [domain] = await db
		.select({ hostname: domains.hostname })
		.from(domains)
		.where(eq(domains.id, domainId))
		.limit(1);
	if (!domain) {
		return null;
	}

	return toResolvedMailbox(mailbox, domainId, domain.hostname);
}

export interface RoutingDecision {
	action: "store" | "forward" | "reject";
	mailbox?: ResolvedMailbox;
	forwardTo?: string;
	/** Forward rules drop the message unless the rule also keeps a copy in the mailbox. */
	keepCopy?: boolean;
	rejectReason?: string;
	/** Set when a domain-scope rule produced this decision, so the caller can record a match. */
	ruleId?: string;
}

/**
 * Resolves what should happen to an inbound message addressed to `toAddress`.
 *
 * Domain-scope rules are evaluated in three phases so that a broad catch-all can never
 * shadow a real mailbox:
 *   1. `reject` rules (block lists) — highest precedence, evaluated before delivery.
 *   2. exact mailbox, then multi-domain mailbox aliases.
 *   3. remaining `forward` / `store` rules — the catch-all fallback.
 * Within each phase rules run by descending priority, then oldest first.
 */
export async function resolveInboundAddress(
	db: AppDatabase,
	toAddress: string,
	fromAddress?: string | null
): Promise<RoutingDecision | null> {
	const parsed = parseRecipientAddress(toAddress);
	if (!parsed) {
		return null;
	}

	const [domain] = await db
		.select()
		.from(domains)
		.where(
			and(eq(domains.hostname, parsed.domain), eq(domains.status, "active"))
		)
		.limit(1);

	if (!domain) {
		return null;
	}

	const domainRules = await listDomainRules(db, domain.id);
	const matchInput: RuleMatchInput = { fromAddress, toAddress };

	// Phase 1 — block rules run before any mailbox lookup so they can block a sender
	// even when the recipient is a real mailbox.
	for (const rule of domainRules) {
		if (rule.action !== "reject") {
			continue;
		}
		if (!matchesRule(rule, matchInput)) {
			continue;
		}
		return {
			action: "reject",
			rejectReason:
				rule.rejectReason?.trim() || "Message rejected by routing rule",
			ruleId: rule.id,
		};
	}
	const resolveMailboxOrFallback =
		async (): Promise<RoutingDecision | null> => {
			// Phase 2 — a real mailbox always wins over a catch-all.
			const exactMailboxes = await db
				.select()
				.from(mailboxes)
				.where(
					and(eq(mailboxes.domainId, domain.id), eq(mailboxes.disabled, false))
				);
			const exactMailbox = exactMailboxes.find(
				(mailbox) =>
					normalizeRecipientLocalPart(mailbox.localPart) === parsed.localPart
			);
			const mailbox =
				exactMailbox ??
				(await resolveMailboxAlias(db, domain.id, parsed.localPart)) ??
				(await resolveMailboxDomainAlias(
					db,
					parsed.localPart,
					parsed.normalizedAddress
				));

			if (mailbox) {
				return {
					action: "store",
					mailbox: toResolvedMailbox(mailbox, domain.id, domain.hostname),
				};
			}

			// Phase 3 — catch-all and forwarding fallbacks.
			for (const rule of domainRules) {
				if (rule.action !== "forward" && rule.action !== "store") {
					continue;
				}
				if (!matchesRule(rule, matchInput)) {
					continue;
				}

				if (rule.action === "forward") {
					const forwardTo = rule.forwardTo?.trim();
					if (!forwardTo) {
						continue;
					}
					const catchAll = rule.mailboxId
						? await getRuleMailbox(db, rule.mailboxId, domain.id)
						: null;
					return {
						action: "forward",
						forwardTo,
						keepCopy: rule.keepCopy && !!catchAll,
						mailbox: catchAll ?? undefined,
						ruleId: rule.id,
					};
				}

				if (!rule.mailboxId) {
					continue;
				}
				const catchAll = await getRuleMailbox(db, rule.mailboxId, domain.id);
				if (!catchAll) {
					continue;
				}
				return { action: "store", mailbox: catchAll, ruleId: rule.id };
			}

			return null;
		};
	return await resolveMailboxOrFallback();
}

/** Records that a domain rule fired, for the "last matched" column in the routing UI. */
export async function recordRuleMatch(
	db: AppDatabase,
	ruleId: string
): Promise<void> {
	const [rule] = await db
		.select({ matchCount: routingRules.matchCount })
		.from(routingRules)
		.where(eq(routingRules.id, ruleId))
		.limit(1);
	if (!rule) {
		return;
	}
	await db
		.update(routingRules)
		.set({ lastMatchedAt: new Date(), matchCount: rule.matchCount + 1 })
		.where(eq(routingRules.id, ruleId));
}

async function getRuleFolderId(
	db: AppDatabase,
	folderId: string,
	mailboxId: string
): Promise<string | null> {
	const [folder] = await db
		.select({ id: folders.id })
		.from(folders)
		.where(and(eq(folders.id, folderId), eq(folders.mailboxId, mailboxId)))
		.limit(1);
	return folder?.id ?? null;
}

export interface InboxRuleDestination {
	status: "received" | "spam" | "trash";
	folderId: string | null;
}

export async function resolveInboxRuleDestination(
	db: AppDatabase,
	input: {
		mailboxId: string;
		toAddress: string;
		fromAddress?: string | null;
		subject?: string | null;
		content?: string | null;
	}
): Promise<InboxRuleDestination> {
	const rules = await db
		.select()
		.from(routingRules)
		.where(
			and(
				eq(routingRules.mailboxId, input.mailboxId),
				eq(routingRules.scope, "mailbox"),
				eq(routingRules.enabled, true)
			)
		)
		.orderBy(desc(routingRules.priority), asc(routingRules.createdAt));

	for (const rule of rules) {
		if (!matchesRule(rule, input)) {
			continue;
		}

		if (rule.action === "spam" || rule.action === "trash") {
			return { folderId: null, status: rule.action };
		}

		if (!rule.folderId) {
			continue;
		}
		const folderId = await getRuleFolderId(db, rule.folderId, input.mailboxId);
		if (!folderId) {
			continue;
		}
		return { folderId, status: "received" };
	}

	return { folderId: null, status: "received" };
}
