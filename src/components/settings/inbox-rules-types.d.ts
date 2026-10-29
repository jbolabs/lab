export interface RuleFolder {
	id: string;
	name: string;
}

export interface InboxRule {
	id: string;
	pattern: string;
	matchField: "email" | "content" | "title";
	matchOperator: "contains" | "exact";
	matchValue: string;
	action: "store" | "forward" | "reject" | "spam" | "trash";
	folderId: string | null;
	priority: number;
}

export interface InboxRuleInput {
	mailboxId: string;
	matchField: "email" | "content" | "title";
	matchOperator: "contains" | "exact";
	matchValue: string;
	destination: string;
	priority: number;
}

export interface InboxRulesResponse {
	rules: InboxRule[];
	error?: string;
}

export interface RuleFoldersResponse {
	folders: RuleFolder[];
	error?: string;
}
