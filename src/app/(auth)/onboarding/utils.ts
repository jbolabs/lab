import { authFetch } from "@/lib/auth/client";

import type {
	DomainCreateResult,
	DomainListResult,
	DomainPreflightResponse,
	MailboxCreateResult,
} from "./types";

export async function getDomains(): Promise<DomainListResult> {
	const res = await authFetch("/api/domains");
	return (await res.json()) as DomainListResult;
}

export async function checkDomain(
	hostname: string
): Promise<DomainPreflightResponse> {
	const res = await authFetch("/api/domains/check", {
		body: JSON.stringify({ hostname }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const data = (await res.json()) as Omit<DomainPreflightResponse, "ok">;
	return { ok: res.ok, ...data };
}

export async function createDomain(
	hostname: string,
	enableSending: boolean,
	replaceMxRecords = false,
	skipDns = false
): Promise<{ ok: boolean; data: DomainCreateResult }> {
	const res = await authFetch("/api/domains", {
		body: JSON.stringify({
			enableRouting: true,
			enableSending,
			hostname,
			replaceMxRecords,
			skipDns,
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

	return {
		data: (await res.json()) as DomainCreateResult,
		ok: res.ok,
	};
}

export async function createMailbox(
	domainId: string,
	localPart: string
): Promise<{ ok: boolean; data: MailboxCreateResult }> {
	const res = await authFetch("/api/mailboxes", {
		body: JSON.stringify({ displayName: localPart, domainId, localPart }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

	return {
		data: (await res.json()) as MailboxCreateResult,
		ok: res.ok,
	};
}
