import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
	ACCOUNTS_COOKIE,
	parseAccountTokens,
	resolveAccounts,
} from "@/lib/auth/accounts";
import { getSessionTokenFromRequestHeaders } from "@/lib/auth/session";
import { getEnv } from "@/lib/cloudflare";

/** Accounts signed in on this browser. Tokens are never returned. */
export async function GET(request: Request) {
	const env = getEnv();
	const jar = await cookies();
	const active = getSessionTokenFromRequestHeaders(request);
	// Include the current session so accounts signed in before this cookie existed still list.
	const accounts = await resolveAccounts(env, [
		...new Set([
			...parseAccountTokens(jar.get(ACCOUNTS_COOKIE)?.value),
			...(active ? [active] : []),
		]),
	]);
	const response = NextResponse.json({
		accounts: accounts.map(({ token, avatarKey: _avatarKey, ...account }) => ({
			...account,
			active: token === active,
		})),
	});
	response.headers.set("Cache-Control", "no-store");
	return response;
}
