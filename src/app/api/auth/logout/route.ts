import {
	ACCOUNTS_COOKIE,
	cookieOptions,
	parseAccountTokens,
	resolveAccounts,
	serializeAccountTokens,
} from "@/lib/auth/accounts";
import { recordAuthActivity } from "@/lib/auth/activity";
import {
	deleteSession,
	getUserFromSession,
	SESSION_COOKIE,
} from "@/lib/auth/session";
import { getEnv } from "@/lib/cloudflare";
import { setResponseCookie } from "@/lib/http/cookies";
import { cookies } from "@/lib/http/request";

export async function POST(request: Request) {
	const env = getEnv();
	const jar = await cookies();
	const authorization = request.headers.get("Authorization");
	const bearerToken = authorization?.startsWith("Bearer ")
		? authorization.slice(7).trim()
		: undefined;
	const token = bearerToken || jar.get(SESSION_COOKIE)?.value;
	if (token) {
		const user = await getUserFromSession(env, token);
		if (user) {
			await recordAuthActivity(env, {
				action: "auth.logout",
				request,
				userId: user.id,
			});
		}
		await deleteSession(env, token);
	}

	// Drop this account from the browser's set; promote another one if present.
	const remaining = await resolveAccounts(
		env,
		parseAccountTokens(jar.get(ACCOUNTS_COOKIE)?.value).filter(
			(entry) => entry !== token
		)
	);
	const next = remaining.at(-1);
	const response = Response.json({
		ok: true,
		...(next ? { redirect: "/inbox", token: next.token } : {}),
	});
	response.headers.set("Cache-Control", "no-store");
	setResponseCookie(
		response,
		SESSION_COOKIE,
		next?.token ?? "",
		cookieOptions(next ? undefined : 0)
	);
	setResponseCookie(
		response,
		ACCOUNTS_COOKIE,
		serializeAccountTokens(remaining.map((account) => account.token)),
		cookieOptions(remaining.length ? undefined : 0)
	);
	return response;
}
