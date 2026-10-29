export type DomainRuleAction = "store" | "forward" | "reject";
export type DomainRuleField = "recipient" | "sender" | "title" | "content";
export type DomainRuleOperator =
	| "contains"
	| "exact"
	| "starts_with"
	| "ends_with"
	| "regex";

export interface DomainRule {
	id: string;
	domainId: string;
	name: string | null;
	enabled: boolean;
	matchField: DomainRuleField;
	matchOperator: DomainRuleOperator;
	matchValue: string;
	action: DomainRuleAction;
	mailboxId: string | null;
	forwardTo: string | null;
	keepCopy: boolean;
	rejectReason: string | null;
	priority: number;
	matchCount: number;
	lastMatchedAt: string | number | null;
}

export interface DomainRuleMailbox {
	id: string;
	localPart: string;
	displayName: string | null;
	disabled: boolean;
}

export interface DomainRuleInput {
	domainId: string;
	name?: string;
	enabled: boolean;
	matchField: DomainRuleField;
	matchOperator: DomainRuleOperator;
	matchValue: string;
	action: DomainRuleAction;
	mailboxId?: string | null;
	forwardTo?: string | null;
	keepCopy: boolean;
	rejectReason?: string | null;
	priority: number;
}

export interface DomainRoutingProps {
	domain?: {
		id: string;
		hostname: string;
	};
}
