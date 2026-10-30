import { completePasswordReset } from "@/lib/auth/password-reset";
import { allowLoginAttempt } from "@/lib/auth/rate-limit";
import { getEnv } from "@/lib/cloudflare";
import { RequestBodyTooLargeError } from "@/lib/http/errors";
import { readJsonBody } from "@/lib/http/request";
import { passwordResetConfirmSchema } from "@/lib/validators";

export async function POST(request: Request) {
	const env = getEnv();
	let body: unknown;
	try {
		body = await readJsonBody(request, 16 * 1024);
	} catch (error) {
		const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
		return Response.json({ error: "Invalid request" }, { status });
	}
	const parsed = passwordResetConfirmSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Choose a password of at least 8 characters" },
			{ status: 400 }
		);
	}
	if (!(await allowLoginAttempt(env, request))) {
		return Response.json(
			{ error: "Too many attempts. Try again shortly." },
			{ headers: { "Retry-After": "60" }, status: 429 }
		);
	}

	const result = await completePasswordReset(
		env,
		parsed.data.token,
		parsed.data.password,
		request
	);
	if (!result.ok) {
		return Response.json({ error: result.error }, { status: 400 });
	}
	return Response.json(
		{ ok: true },
		{ headers: { "Cache-Control": "no-store" } }
	);
}
