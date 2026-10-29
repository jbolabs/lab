export async function confirmPasswordReset(
	token: string,
	password: string
): Promise<{ ok: boolean; error?: string }> {
	const res = await fetch("/api/auth/password-reset/confirm", {
		body: JSON.stringify({ password, token }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
		signal: AbortSignal.timeout(20_000),
	});
	const data = (await res.json().catch(() => ({}))) as {
		ok?: boolean;
		error?: string;
	};
	return {
		error: typeof data.error === "string" ? data.error : undefined,
		ok: res.ok,
	};
}
