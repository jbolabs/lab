"use client";

import { authFetch, setClientSessionToken } from "@/lib/auth/client";

export interface BrowserAccount {
	userId: string;
	email: string;
	name: string;
	hasAvatar: boolean;
	active: boolean;
}

export async function fetchBrowserAccounts(): Promise<BrowserAccount[]> {
	try {
		const res = await authFetch("/api/auth/accounts", {
			cache: "no-store",
			redirectOnUnauthorized: false,
		});
		if (!res.ok) {
			return [];
		}
		return ((await res.json()) as { accounts: BrowserAccount[] }).accounts;
	} catch {
		return [];
	}
}

/** Returns an error message, or null once the switch succeeded. */
export async function switchBrowserAccount(
	userId: string
): Promise<string | null> {
	const res = await authFetch("/api/auth/switch", {
		body: JSON.stringify({ userId }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
		redirectOnUnauthorized: false,
	});
	const data = (await res.json().catch(() => ({}))) as {
		token?: string;
		error?: string;
	};
	if (!res.ok || !data.token) {
		return data.error ?? "Could not switch account";
	}
	setClientSessionToken(data.token);
	return null;
}
