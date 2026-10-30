import {
	ACCOUNTS_COOKIE,
	cookieOptions,
	isSameOrigin,
	parseAccountTokens,
	resolveAccounts,
	serializeAccountTokens,
} from "@/lib/auth/accounts";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getEnv } from "@/lib/cloudflare";
import { setResponseCookie } from "@/lib/http/cookies";
import { cookies } from "@/lib/http/request";

/**
 * Make another signed-in account the active one. The client names a user id;
 * the token comes from the httpOnly accounts cookie and is re-validated here.
 * The token is returned because the web client mirrors the active session
 * in its bearer header, exactly as it does after a normal login.
 */
export async function POST(request: Request) {
	if (!isSameOrigin(request)) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}
	const env = getEnv();
	const body = (await request.json().catch(() => null)) as {
		userId?: unknown;
	} | null;
	const userId = typeof body?.userId === "string" ? body.userId : "";
	const jar = await cookies();
	const accounts = await resolveAccounts(
		env,
		parseAccountTokens(jar.get(ACCOUNTS_COOKIE)?.value)
	);
	const target = accounts.find((account) => account.userId === userId);
	if (!target) {
		return Response.json(
			{ error: "Sign in again to use this account" },
			{ status: 401 }
		);
	}

	const response = Response.json({
		ok: true,
		redirect: "/inbox",
		token: target.token,
	});
	response.headers.set("Cache-Control", "no-store");
	setResponseCookie(response, SESSION_COOKIE, target.token, cookieOptions());
	// Prune dead entries while we are here.
	setResponseCookie(
		response,
		ACCOUNTS_COOKIE,
		serializeAccountTokens(accounts.map((account) => account.token)),
		cookieOptions()
	);
	return response;
}
