import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ACCOUNTS_COOKIE, rememberLogin } from "@/lib/auth/accounts";
import { recordAuthActivity } from "@/lib/auth/activity";
import {
	consumeLoginChallenge,
	getLoginChallengeUserId,
} from "@/lib/auth/login-challenge";
import { verifySecondFactor } from "@/lib/auth/mfa";
import { allowLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getEnv } from "@/lib/cloudflare";
import { setResponseCookie } from "@/lib/http/cookies";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { cookies, readJsonBody } from "@/lib/http/request";
import { mfaVerifySchema } from "@/lib/validators";

/** Second step of a login: trade a challenge plus a TOTP or recovery code for a session. */
export async function POST(request: Request) {
	const env = getEnv();
	let body: unknown;
	try {
		body = await readJsonBody(request, 16 * 1024);
	} catch (error) {
		const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
		return Response.json({ error: "Invalid request" }, { status });
	}
	const parsed = mfaVerifySchema.safeParse(body);
	if (!parsed.success) {
		return Response.json({ error: parsed.error.flatten() }, { status: 400 });
	}
	// Codes are six digits; the login limiter is what stops brute force.
	if (!(await allowLoginAttempt(env, request))) {
		return Response.json(
			{ error: "Too many attempts. Try again shortly." },
			{ headers: { "Retry-After": "60" }, status: 429 }
		);
	}

	const userId = await getLoginChallengeUserId(env, parsed.data.challengeToken);
	if (!userId) {
		return Response.json(
			{ error: "This sign-in attempt has expired. Start again." },
			{ status: 401 }
		);
	}
	const db = getDb(env);
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user || user.disabled) {
		return Response.json({ error: "Account disabled" }, { status: 403 });
	}
	const method = await verifySecondFactor(env, user, parsed.data.code);
	if (!method) {
		return Response.json({ error: "That code did not match" }, { status: 401 });
	}

	await consumeLoginChallenge(env, parsed.data.challengeToken);
	const token = await createSession(env, user.id);
	await recordAuthActivity(env, {
		action: "auth.login",
		request,
		userId: user.id,
	});
	await recordAuthActivity(env, {
		action: "auth.mfa_verified",
		request,
		userId: user.id,
	});
	const response = Response.json({
		method,
		ok: true,
		redirect: "/inbox",
		token,
	});
	response.headers.set("Cache-Control", "no-store");
	setResponseCookie(response, SESSION_COOKIE, token, {
		httpOnly: true,
		maxAge: 60 * 60 * 24 * 30,
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	});
	const accountsJar = await cookies();
	await rememberLogin(
		env,
		response,
		accountsJar.get(ACCOUNTS_COOKIE)?.value,
		token,
		accountsJar.get(SESSION_COOKIE)?.value
	);
	return response;
}
