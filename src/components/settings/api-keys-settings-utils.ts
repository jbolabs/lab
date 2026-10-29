import type { ApiKeyScope } from "@/lib/api/scopes";
import { authFetch } from "@/lib/auth/client";
import type { TranslationKey } from "@/lib/i18n/types";

import type { ManagedApiKey, McpKeyScope } from "./api-keys-settings-types";

export const MCP_KEY_SCOPES: {
	value: McpKeyScope;
	labelKey: TranslationKey;
	descriptionKey: TranslationKey;
}[] = [
	{
		descriptionKey: "apiKeys.mcpRead.description",
		labelKey: "apiKeys.mcpRead.label",
		value: "mcp:read",
	},
	{
		descriptionKey: "apiKeys.mcpDraft.description",
		labelKey: "apiKeys.mcpDraft.label",
		value: "mcp:draft",
	},
	{
		descriptionKey: "apiKeys.mcpOrganize.description",
		labelKey: "apiKeys.mcpOrganize.label",
		value: "mcp:organize",
	},
	{
		descriptionKey: "apiKeys.mcpRequestSend.description",
		labelKey: "apiKeys.mcpRequestSend.label",
		value: "mcp:request-send",
	},
	{
		descriptionKey: "apiKeys.mcpCalendarRead.description",
		labelKey: "apiKeys.mcpCalendarRead.label",
		value: "mcp:calendar-read",
	},
	{
		descriptionKey: "apiKeys.mcpCalendarWrite.description",
		labelKey: "apiKeys.mcpCalendarWrite.label",
		value: "mcp:calendar-write",
	},
];

export const STANDARD_KEY_SCOPES: {
	value: ApiKeyScope;
	labelKey: TranslationKey;
	descriptionKey: TranslationKey;
}[] = [
	{
		descriptionKey: "apiKeys.read.description",
		labelKey: "apiKeys.read.label",
		value: "read",
	},
	{
		descriptionKey: "apiKeys.send.description",
		labelKey: "apiKeys.send.label",
		value: "send",
	},
	{
		descriptionKey: "apiKeys.calendarRead.description",
		labelKey: "apiKeys.calendarRead.label",
		value: "calendar:read",
	},
	{
		descriptionKey: "apiKeys.calendarWrite.description",
		labelKey: "apiKeys.calendarWrite.label",
		value: "calendar:write",
	},
];

function responseData(
	response: Response
): Promise<{ error?: unknown; key?: string; apiKeys?: ManagedApiKey[] }> {
	return response.json().catch(() => ({})) as Promise<{
		error?: unknown;
		key?: string;
		apiKeys?: ManagedApiKey[];
	}>;
}

export function keyPermissions(key: ManagedApiKey): string[] {
	try {
		const scopes: unknown = JSON.parse(key.scopes);
		return Array.isArray(scopes)
			? scopes.filter((scope): scope is string => typeof scope === "string")
			: [];
	} catch {
		return [];
	}
}

export async function loadManagedApiKeys(): Promise<ManagedApiKey[]> {
	const response = await authFetch("/api/api-keys");
	const data = await responseData(response);
	if (!response.ok || !data.apiKeys) {
		throw new Error(
			typeof data.error === "string" ? data.error : "Could not load API keys"
		);
	}
	return data.apiKeys;
}

export async function createManagedApiKey(input: {
	name: string;
	mcpAllowed: boolean;
	scopes: ApiKeyScope[] | McpKeyScope[];
	mailboxIds: string[];
}): Promise<string> {
	const response = await authFetch(
		input.mcpAllowed ? "/api/agent/mcp-keys" : "/api/api-keys",
		{
			body: JSON.stringify({
				mailboxIds: input.mailboxIds,
				name: input.name,
				scopes: input.scopes,
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		}
	);
	const data = await responseData(response);
	if (!response.ok || !data.key) {
		throw new Error(
			typeof data.error === "string" ? data.error : "Could not create API key"
		);
	}
	return data.key;
}

export async function revokeManagedApiKey(id: string): Promise<void> {
	const response = await authFetch(
		`/api/api-keys?id=${encodeURIComponent(id)}`,
		{ method: "DELETE" }
	);
	if (!response.ok) {
		const data = await responseData(response);
		throw new Error(
			typeof data.error === "string" ? data.error : "Could not revoke API key"
		);
	}
}
