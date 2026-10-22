import { getEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/cookies";
import { canonicalOrigin, OAuthFailure, oauthError, oauthJson } from "@/lib/oauth/config";
import { boundedText } from "@/lib/oauth/protocol";
import { completeConsent } from "@/lib/oauth/consent";

export async function POST(request: Request) {
	try {
		const env = getEnv();
		const origin = canonicalOrigin(env, request);
		// Browser consent is cookie-only and must be an explicit same-origin form submission.
		if (request.headers.has("Authorization") || request.headers.get("Origin") !== origin) throw new OAuthFailure("access_denied", "Invalid origin", 403);
		const user = await getCurrentUser(env, request);
		if (!user) throw new OAuthFailure("access_denied", "Sign in before approving access", 401);
		if (Number(request.headers.get("Content-Length")) > 16384) throw new OAuthFailure("invalid_request", "Request is too large", 413);
		const form = new URLSearchParams(await boundedText(request));
		const url = await completeConsent(env, user, String(form.get("request") ?? ""), String(form.get("decision") ?? ""), form.getAll("scope").map(String), form.getAll("mailbox").map(String));
		return oauthJson({ redirectTo: url });
	} catch (error) { return oauthError(error); }
}
