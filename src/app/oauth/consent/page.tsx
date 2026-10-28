import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { getDb } from "@/db";
import { listAccessibleMailboxes } from "@/lib/mailboxes/access";
import { OAuthStore } from "@/lib/oauth/store";
import { consentDetails } from "@/lib/oauth/consent";
import { EMAIL_SCOPES } from "@/lib/oauth/config";
import { ConsentForm } from "@/components/settings/oauth-consent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect an assistant · Lab", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
	const env = getEnv();
	const ticket = (await searchParams).request || "";
	const user = await getCurrentUser(env);
	if (!user) redirect("/login");
	const pending = await new OAuthStore(env.DB).pending(ticket, user.id);
	if (!pending) return <main className="mx-auto max-w-lg px-6 py-16"><h1 className="text-2xl font-medium">Connection request expired</h1><p className="mt-4 text-neutral-600">Return to your assistant and connect again.</p></main>;
	const details = await consentDetails(env, pending, user).catch(() => null);
	if (!details) return <main className="mx-auto max-w-lg px-6 py-16"><h1 className="text-2xl font-medium">Access unavailable</h1><p className="mt-4 text-neutral-600">This account cannot approve the requested permissions. Return to your assistant and connect with an authorized account.</p></main>;
	const { client, parameters, scopes } = details;
	const hasMail = scopes.some((scope) => EMAIL_SCOPES.includes(scope));
	const mailboxes = hasMail ? await listAccessibleMailboxes(getDb(env), user) : [];
	return <ConsentForm ticket={ticket} name={client.name} redirectHost={new URL(parameters.redirect_uri).host} email={user.email} scopes={scopes} mailboxes={mailboxes.map((mailbox) => ({ id: mailbox.id, address: `${mailbox.localPart}@${mailbox.hostname}` }))} />;
}
