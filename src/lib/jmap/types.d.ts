import type { AppDatabase } from "@/db";
import type { ApiAuthResult } from "@/lib/api/key-auth-types";

export type JmapId = string;

/** [methodName, arguments, callId] */
export type JmapInvocation = [string, Record<string, unknown>, string];

export interface JmapRequest {
	using: string[];
	methodCalls: JmapInvocation[];
	createdIds?: Record<string, JmapId>;
}

export interface JmapResponse {
	methodResponses: JmapInvocation[];
	createdIds?: Record<string, JmapId>;
	sessionState: string;
}

export interface JmapMethodError {
	type: string;
	description?: string;
	[key: string]: unknown;
}

/** RFC 8620 §5.3 SetError: why one object in a /set or /import call was rejected. */
export interface JmapSetError {
	type: string;
	properties?: string[];
	description?: string;
}

export interface JmapContext {
	env: CloudflareEnv;
	db: AppDatabase;
	auth: ApiAuthResult;
	accountId: string;
	origin: string;
	/** Client-assigned creation ids resolved so far in this request. */
	createdIds: Record<string, JmapId>;
}

export type JmapMethodHandler = (
	ctx: JmapContext,
	args: Record<string, unknown>
) => Promise<Record<string, unknown> | JmapMethodError>;

export type SystemRole =
	| "inbox"
	| "sent"
	| "drafts"
	| "archive"
	| "junk"
	| "trash";

/** How a JMAP Mailbox id maps onto Mailflare's mailbox × status/folder model. */
export type MailboxRef =
	| { kind: "account"; mailboxId: string }
	| { kind: "role"; mailboxId: string; role: SystemRole }
	| { kind: "folder"; mailboxId: string; folderId: string };

export interface AccessibleMailbox {
	id: string;
	userId: string;
	localPart: string;
	hostname: string;
	displayName: string | null;
	permission: "read_only" | "send_as" | "send_on_behalf" | "full_access";
	type: "personal" | "shared";
	isPrimary: boolean;
}

export interface EmailAddressObject {
	name: string | null;
	email: string;
}

export interface EmailBodyPart {
	partId: string | null;
	blobId: string | null;
	size: number;
	headers?: { name: string; value: string }[];
	name: string | null;
	type: string;
	charset: string | null;
	disposition: string | null;
	cid: string | null;
	language: string[] | null;
	location: string | null;
	subParts?: EmailBodyPart[];
}

export interface FilterCondition {
	inMailbox?: string;
	inMailboxOtherThan?: string[];
	before?: string;
	after?: string;
	minSize?: number;
	maxSize?: number;
	hasKeyword?: string;
	notKeyword?: string;
	allInThreadHaveKeyword?: string;
	someInThreadHaveKeyword?: string;
	noneInThreadHaveKeyword?: string;
	text?: string;
	from?: string;
	to?: string;
	cc?: string;
	bcc?: string;
	subject?: string;
	body?: string;
	hasAttachment?: boolean;
	/** `[name]` matches messages carrying the header; `[name, value]` those whose value equals it. */
	header?: string[];
}

export interface FilterOperator {
	operator: "AND" | "OR" | "NOT";
	conditions: Filter[];
}

export type Filter = FilterOperator | FilterCondition;

export interface Comparator {
	property: string;
	isAscending?: boolean;
	collation?: string;
}
