import { getEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/cookies";
import { hash, now, oauthError, secret } from "@/lib/oauth/config";
import { validateAuthorization } from "@/lib/oauth/protocol";
import { OAuthStore } from "@/lib/oauth/store";

export async function GET(request: Request) {
	try {
		const env = getEnv();
		const store = new OAuthStore(env.DB);
		await store.rateLimit(request, "authorize", 100);
		const { parameters, origin } = await validateAuthorization(env, request);
		const user = await getCurrentUser(env, request);
		if (!user) {
			const login = new URL("/login", origin);
			login.searchParams.set("returnTo", new URL(request.url).pathname + new URL(request.url).search);
			return Response.redirect(login, 303);
		}
		await store.cleanup();
		const ticket = secret();
		await store.db.prepare("INSERT INTO oauth_requests(hash, user_id, parameters, expires_at) VALUES (?, ?, ?, ?)").bind(await hash(ticket), user.id, JSON.stringify(parameters), now() + 600).run();
		return new Response(null, { status: 303, headers: { Location: `${origin}/oauth/consent?request=${ticket}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
	} catch (error) { return oauthError(error); }
}
