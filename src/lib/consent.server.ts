import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { listAccessibleMailboxes } from "@/lib/mailboxes/access";
import { redirect } from "@/lib/navigation";
import { EMAIL_SCOPES } from "@/lib/oauth/config";
import { consentDetails } from "@/lib/oauth/consent";
import { OAuthStore } from "@/lib/oauth/store";

export async function loadConsent(input: { request?: string }) {
	const env = getEnv();
	const search = input;
	const ticket = search.request || "";
	const user = await getCurrentUser(env);
	if (!user) {
		redirect("/login");
	}
	const pending = await new OAuthStore(env.DB).pending(ticket, user.id);
	if (!pending) {
		return { error: "expired" as const };
	}
	const details = await consentDetails(env, pending, user).catch(() => null);
	if (!details) {
		return { error: "unavailable" as const };
	}
	const { client, parameters, scopes } = details;
	const hasMail = scopes.some((scope) => EMAIL_SCOPES.includes(scope));
	const mailboxes = hasMail
		? await listAccessibleMailboxes(getDb(env), user)
		: [];
	return {
		email: user.email,
		mailboxes: mailboxes.map((mailbox) => ({
			address: `${mailbox.localPart}@${mailbox.hostname}`,
			id: mailbox.id,
		})),
		name: client.name,
		redirectHost: new URL(parameters.redirect_uri).host,
		scopes,
		ticket,
	};
}
