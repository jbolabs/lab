import { and, eq, gt, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { hashSessionToken } from "@/lib/auth/session";

export const MAX_ACCOUNTS = 5;

export function parseAccountTokens(value: string | undefined): string[] {
	if (!value) {
		return [];
	}
	return [...new Set(value.split(".").filter(Boolean))].slice(0, MAX_ACCOUNTS);
}

export function serializeAccountTokens(tokens: string[]): string {
	return tokens.join(".");
}

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function cookieOptions(maxAge = COOKIE_MAX_AGE) {
	return {
		httpOnly: true,
		maxAge,
		path: "/",
		sameSite: "lax" as const,
		secure: process.env.NODE_ENV === "production",
	};
}

/** Cross-site POSTs must not be able to switch or add accounts. */
export function isSameOrigin(request: Request): boolean {
	const origin = request.headers.get("Origin");
	if (!origin) {
		return true;
	}
	try {
		return new URL(origin).host === new URL(request.url).host;
	} catch {
		return false;
	}
}

export interface AccountSummary {
	userId: string;
	email: string;
	name: string;
	hasAvatar: boolean;
	avatarKey: string | null;
	token: string;
}

/** Resolve tokens to live, enabled users; dead tokens are dropped. */
export async function resolveAccounts(
	env: CloudflareEnv,
	tokens: string[]
): Promise<AccountSummary[]> {
	if (tokens.length === 0) {
		return [];
	}
	const db = getDb(env);
	const hashes = await Promise.all(
		tokens.map((token) => hashSessionToken(token))
	);
	const rows = await db
		.select({ tokenHash: sessions.tokenHash, user: users })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(
			and(
				inArray(sessions.tokenHash, hashes),
				gt(sessions.expiresAt, new Date())
			)
		);
	const byHash = new Map(rows.map((row) => [row.tokenHash, row.user]));
	const accounts: AccountSummary[] = [];
	for (let i = 0; i < tokens.length; i += 1) {
		const user = byHash.get(hashes[i]);
		if (!user || user.disabled) {
			continue;
		}
		accounts.push({
			avatarKey: user.avatarKey,
			email: user.email,
			hasAvatar: !!user.avatarKey,
			name: user.name,
			token: tokens[i],
			userId: user.id,
		});
	}
	return accounts;
}

/** Add `token` to the set, replacing older entries for the same user. */
export async function addAccountToken(
	env: CloudflareEnv,
	existing: string | undefined,
	token: string,
	previousActive?: string
): Promise<string> {
	// The session being replaced may predate the accounts cookie; keep it.
	const current = await resolveAccounts(env, [
		...parseAccountTokens(existing),
		...(previousActive ? [previousActive] : []),
	]);
	const [added] = await resolveAccounts(env, [token]);
	const kept = current
		.filter((account) => account.userId !== added?.userId)
		.map((account) => account.token);
	return serializeAccountTokens([...kept, token].slice(-MAX_ACCOUNTS));
}

export const ACCOUNTS_COOKIE = "ep_accounts";

/**
 * Record a fresh login in the accounts cookie. Switching accounts is a
 * convenience, so a failure here must never block the login itself.
 */
export async function rememberLogin(
	env: CloudflareEnv,
	response: {
		cookies: {
			set: (
				name: string,
				value: string,
				options: ReturnType<typeof cookieOptions>
			) => unknown;
		};
	},
	existing: string | undefined,
	token: string,
	previousActive?: string
): Promise<void> {
	try {
		response.cookies.set(
			ACCOUNTS_COOKIE,
			await addAccountToken(env, existing, token, previousActive),
			cookieOptions()
		);
	} catch (error) {
		console.error("Could not record signed-in account", error);
	}
}

export { SESSION_COOKIE } from "@/lib/auth/session";
