export async function requestPasswordReset(
	form: FormData
): Promise<{ ok: boolean; error?: string }> {
	const res = await fetch("/api/auth/password-reset/request", {
		body: JSON.stringify({
			email: form.get("email"),
			turnstileToken: form.get("turnstileToken"),
		}),
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
