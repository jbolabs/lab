import { persistAuthSession } from "@/lib/auth/client";

import type { LoginResult } from "./types";

export async function submitLogin(
	form: FormData
): Promise<{ ok: boolean; data: LoginResult }> {
	const res = await fetch("/api/auth/login", {
		body: JSON.stringify({
			email: form.get("email"),
			password: form.get("password"),
			turnstileToken: form.get("turnstileToken"),
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
		signal: AbortSignal.timeout(20_000),
	});

	return {
		data: (await persistAuthSession(res)) as LoginResult,
		ok: res.ok,
	};
}

/** Second step: the challenge from the password step plus a TOTP or recovery code. */
export async function submitMfaCode(
	challengeToken: string,
	code: string
): Promise<{ ok: boolean; data: LoginResult }> {
	const res = await fetch("/api/auth/mfa/verify", {
		body: JSON.stringify({ challengeToken, code }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
		signal: AbortSignal.timeout(20_000),
	});
	return { data: (await persistAuthSession(res)) as LoginResult, ok: res.ok };
}
