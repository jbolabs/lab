import { requestPasswordReset } from "@/lib/auth/password-reset";
import { allowLoginAttempt } from "@/lib/auth/rate-limit";
import { verifyTurnstileToken } from "@/lib/auth/turnstile";
import { getEnv } from "@/lib/cloudflare";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { readJsonBody } from "@/lib/http/request";
import { getServerTranslator } from "@/lib/i18n/server";
import { passwordResetRequestSchema } from "@/lib/validators";

/**
 * Always answers 200 once the input is well-formed, whether or not the
 * account exists or has a recovery address, so the form reveals nothing.
 */
export async function POST(request: Request) {
	const env = getEnv();
	let body: unknown;
	try {
		body = await readJsonBody(request, 16 * 1024);
	} catch (error) {
		const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
		return Response.json({ error: "Invalid request" }, { status });
	}
	const parsed = passwordResetRequestSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Enter the email address you sign in with" },
			{ status: 400 }
		);
	}
	if (!(await allowLoginAttempt(env, request))) {
		return Response.json(
			{ error: "Too many attempts. Try again shortly." },
			{ headers: { "Retry-After": "60" }, status: 429 }
		);
	}
	if (
		!(await verifyTurnstileToken(
			env,
			request,
			(body as Record<string, unknown>).turnstileToken
		))
	) {
		return Response.json(
			{ error: "Verification failed. Please try again." },
			{ status: 400 }
		);
	}

	const origin = env.APP_URL?.trim() || new URL(request.url).origin;
	try {
		await requestPasswordReset(
			env,
			parsed.data.email,
			origin,
			await getServerTranslator()
		);
	} catch (error) {
		// Delivery problems are logged, never surfaced: the answer stays uniform.
		console.error("Password reset request failed", error);
	}
	return Response.json(
		{ ok: true },
		{ headers: { "Cache-Control": "no-store" } }
	);
}
