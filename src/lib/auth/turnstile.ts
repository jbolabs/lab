import { newId } from "@/lib/ids";

interface TurnstileResponse {
	success: boolean;
	"error-codes"?: string[];
}

export async function verifyTurnstileToken(
	env: Pick<CloudflareEnv, "TURNSTILE_SECRET_KEY">,
	request: Request,
	token: unknown
): Promise<boolean> {
	const secret = env.TURNSTILE_SECRET_KEY?.trim();
	if (!secret) {
		return true;
	}
	if (typeof token !== "string" || !token.trim() || token.length > 2048) {
		return false;
	}

	let response: Response;
	try {
		response = await fetch(
			"https://challenges.cloudflare.com/turnstile/v0/siteverify",
			{
				body: JSON.stringify({
					idempotency_key: newId("ts"),
					remoteip: request.headers.get("cf-connecting-ip") ?? undefined,
					response: token,
					secret,
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
				signal: AbortSignal.timeout(10_000),
			}
		);
	} catch {
		return false;
	}

	if (!response.ok) {
		return false;
	}
	const result = (await response.json()) as TurnstileResponse;
	return result.success;
}
