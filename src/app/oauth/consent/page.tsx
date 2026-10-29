import { redirect } from "next/navigation";

import { ConsentForm } from "@/components/settings/oauth-consent";
import {
	PageDescription,
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { listAccessibleMailboxes } from "@/lib/mailboxes/access";
import { EMAIL_SCOPES } from "@/lib/oauth/config";
import { consentDetails } from "@/lib/oauth/consent";
import { OAuthStore } from "@/lib/oauth/store";

export const dynamic = "force-dynamic";
export const metadata = {
	referrer: "no-referrer" as const,
	robots: { follow: false, index: false },
	title: "Connect an assistant · The Lab",
};
export default async function ConsentPage({
	searchParams,
}: {
	searchParams: Promise<{ request?: string }>;
}) {
	const env = getEnv();
	const search = await searchParams;
	const ticket = search.request || "";
	const user = await getCurrentUser(env);
	if (!user) {
		redirect("/login");
	}
	const pending = await new OAuthStore(env.DB).pending(ticket, user.id);
	if (!pending) {
		return (
			<main className="mx-auto max-w-lg px-6 py-16">
				<PageHeader>
					<PageHeaderText>
						<PageTitle>Connection request expired</PageTitle>
						<PageDescription>
							Return to your assistant and connect again.
						</PageDescription>
					</PageHeaderText>
				</PageHeader>
			</main>
		);
	}
	const details = await consentDetails(env, pending, user).catch(() => null);
	if (!details) {
		return (
			<main className="mx-auto max-w-lg px-6 py-16">
				<PageHeader>
					<PageHeaderText>
						<PageTitle>Access unavailable</PageTitle>
						<PageDescription>
							This account cannot approve the requested permissions. Return to
							your assistant and connect with an authorized account.
						</PageDescription>
					</PageHeaderText>
				</PageHeader>
			</main>
		);
	}
	const { client, parameters, scopes } = details;
	const hasMail = scopes.some((scope) => EMAIL_SCOPES.includes(scope));
	const mailboxes = hasMail
		? await listAccessibleMailboxes(getDb(env), user)
		: [];
	return (
		<ConsentForm
			ticket={ticket}
			name={client.name}
			redirectHost={new URL(parameters.redirect_uri).host}
			email={user.email}
			scopes={scopes}
			mailboxes={mailboxes.map((mailbox) => ({
				address: `${mailbox.localPart}@${mailbox.hostname}`,
				id: mailbox.id,
			}))}
		/>
	);
}
