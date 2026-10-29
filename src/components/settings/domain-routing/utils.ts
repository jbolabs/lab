import { authFetch } from "@/lib/auth/client";
import type { TranslationKey } from "@/lib/i18n/types";
import { defaultTranslator } from "@/lib/i18n/utils";
import type { Translator } from "@/lib/i18n/utils";
import { formatUserDate } from "@/lib/time/utils";

import type {
	DomainRule,
	DomainRuleField,
	DomainRuleInput,
	DomainRuleMailbox,
	DomainRuleOperator,
} from "./types";

export const MATCH_FIELD_LABELS: Record<DomainRuleField, TranslationKey> = {
	content: "routing.field.content",
	recipient: "routing.field.recipient",
	sender: "routing.field.sender",
	title: "routing.field.title",
};

export const MATCH_OPERATOR_LABELS: Record<DomainRuleOperator, TranslationKey> =
	{
		contains: "routing.operator.contains",
		ends_with: "routing.operator.ends_with",
		exact: "routing.operator.exact",
		regex: "routing.operator.regex",
		starts_with: "routing.operator.starts_with",
	};

export const ACTION_LABELS = {
	forward: "routing.action.forward",
	reject: "routing.action.reject",
	store: "routing.action.store",
} satisfies Record<DomainRule["action"], TranslationKey>;

async function readJson<T>(res: Response): Promise<T> {
	const json = (await res.json()) as T & { error?: unknown };
	if (!res.ok) {
		throw new Error(
			typeof json.error === "string"
				? json.error
				: defaultTranslator("routing.requestFailed")
		);
	}
	return json;
}

export async function fetchDomainRules(
	domainId: string,
	mailboxId?: string
): Promise<{ rules: DomainRule[]; mailboxes: DomainRuleMailbox[] }> {
	const params = new URLSearchParams({ domainId });
	if (mailboxId) {
		params.set("mailboxId", mailboxId);
	}
	const res = await authFetch(`/api/routing-rules/domain?${params}`);
	const json = await readJson<{
		rules: DomainRule[];
		mailboxes: DomainRuleMailbox[];
	}>(res);
	return { mailboxes: json.mailboxes ?? [], rules: json.rules ?? [] };
}

function domainRuleUrl(id: string | null, mailboxId?: string): string {
	const params = new URLSearchParams();
	if (mailboxId) {
		params.set("mailboxId", mailboxId);
	}
	const queryString = params.toString();
	const query = queryString ? `?${queryString}` : "";
	return `/api/routing-rules/domain${id ? `/${id}` : ""}${query}`;
}

export async function createDomainRule(
	input: DomainRuleInput,
	mailboxId?: string
) {
	return readJson(
		await authFetch(domainRuleUrl(null, mailboxId), {
			body: JSON.stringify(input),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		})
	);
}

export async function updateDomainRule(
	id: string,
	input: DomainRuleInput,
	mailboxId?: string
) {
	return readJson(
		await authFetch(domainRuleUrl(id, mailboxId), {
			body: JSON.stringify(input),
			headers: { "Content-Type": "application/json" },
			method: "PATCH",
		})
	);
}

export async function deleteDomainRule(id: string, mailboxId?: string) {
	return readJson(
		await authFetch(domainRuleUrl(id, mailboxId), { method: "DELETE" })
	);
}

export function describeRule(
	rule: DomainRule,
	mailboxes: DomainRuleMailbox[],
	hostname: string,
	t: Translator = defaultTranslator
): string {
	const condition =
		rule.matchValue === "*"
			? t("routing.anyMessage")
			: `${t(MATCH_FIELD_LABELS[rule.matchField])} ${t(MATCH_OPERATOR_LABELS[rule.matchOperator])} "${rule.matchValue}"`;

	if (rule.action === "reject") {
		return t("routing.describe.reject", { condition });
	}
	if (rule.action === "forward") {
		return t(
			rule.keepCopy
				? "routing.describe.forwardCopy"
				: "routing.describe.forward",
			{ condition, to: rule.forwardTo ?? "—" }
		);
	}
	const mailbox = mailboxes.find((m) => m.id === rule.mailboxId);
	const address = mailbox ? `${mailbox.localPart}@${hostname}` : "—";
	return t("routing.describe.store", { address, condition });
}

export function formatLastMatched(
	value: DomainRule["lastMatchedAt"],
	t: Translator = defaultTranslator
): string {
	if (value === null || value === undefined) {
		return t("routing.never");
	}
	const numeric = typeof value === "number" ? value : Date.parse(String(value));
	if (!Number.isFinite(numeric)) {
		return t("routing.never");
	}
	// Drizzle timestamps serialise as seconds when they bypass the mapper.
	const ms = numeric < 1e12 ? numeric * 1000 : numeric;
	return formatUserDate(new Date(ms), {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

export function emptyRuleInput(domainId: string): DomainRuleInput {
	return {
		action: "store",
		domainId,
		enabled: true,
		forwardTo: "",
		keepCopy: false,
		mailboxId: null,
		matchField: "recipient",
		matchOperator: "contains",
		matchValue: "",
		name: "",
		priority: 100,
		rejectReason: "",
	};
}

export function ruleToInput(rule: DomainRule): DomainRuleInput {
	return {
		action: rule.action,
		domainId: rule.domainId,
		enabled: rule.enabled,
		forwardTo: rule.forwardTo ?? "",
		keepCopy: rule.keepCopy,
		mailboxId: rule.mailboxId,
		matchField: rule.matchField,
		matchOperator: rule.matchOperator,
		matchValue: rule.matchValue,
		name: rule.name ?? "",
		priority: rule.priority,
		rejectReason: rule.rejectReason ?? "",
	};
}
