import { requireSessionUser } from "@/lib/api/auth";
import { disableMfa, verifySecondFactor } from "@/lib/auth/mfa";
import { verifyPassword } from "@/lib/auth/password";
import { getEnv } from "@/lib/cloudflare";
import { readJsonBody } from "@/lib/http/request";
import { mfaDisableSchema } from "@/lib/validators";

/** Turning MFA off needs both factors, so a stolen session alone cannot do it. */
export async function POST(request: Request) {
	const env = getEnv();
	const auth = await requireSessionUser(env, request);
	if (auth.error) {
		return auth.error;
	}
	const parsed = mfaDisableSchema.safeParse(
		await readJsonBody(request, 16 * 1024).catch(() => null)
	);
	if (!parsed.success) {
		return Response.json(
			{ error: "Enter your password and a code" },
			{ status: 400 }
		);
	}
	if (!verifyPassword(parsed.data.password, auth.user.passwordHash)) {
		return Response.json({ error: "Password is incorrect" }, { status: 400 });
	}
	if (!(await verifySecondFactor(env, auth.user, parsed.data.code))) {
		return Response.json({ error: "That code did not match" }, { status: 400 });
	}
	await disableMfa(env, auth.user.id);
	return Response.json({ ok: true });
}
