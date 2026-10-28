"use client";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { EMAIL_SCOPES } from "@/lib/oauth/config";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function ConsentForm({ ticket, name, redirectHost, email, scopes, mailboxes }: { ticket: string; name: string; redirectHost: string; email: string; scopes: string[]; mailboxes: { id: string; address: string }[] }) {
	const { t } = useLanguage();
	const [selectedScopes, setSelectedScopes] = useState(scopes);
	const [selectedMailboxes, setSelectedMailboxes] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
		const body = new URLSearchParams();
		for (const [key, value] of new FormData(event.currentTarget)) body.append(key, String(value));
		body.set("decision", submitter?.value ?? "deny");
		setBusy(true); setError(null);
		try {
			const response = await fetch("/oauth/approve", { method: "POST", body });
			const data = await response.json() as { redirectTo?: string; error_description?: string };
			if (!response.ok || !data.redirectTo) throw new Error(data.error_description || t("oauth.connectionError"));
			window.location.assign(data.redirectTo);
		} catch (cause) { setError(cause instanceof Error ? cause.message : t("oauth.connectionError")); setBusy(false); }
	}
	const needsMailbox = selectedScopes.some((scope) => EMAIL_SCOPES.includes(scope));
	return <main className="mx-auto w-full max-w-xl px-6 py-12 sm:py-20">
		<h1 className="text-2xl font-medium text-neutral-900">{t("oauth.connectTitle", { name })}</h1>
		<p className="mt-3 break-words text-sm text-neutral-600">{t("oauth.signedInAs", { email })}</p>
		<p className="mt-5 text-sm text-neutral-700">{t("oauth.requestDescription")}</p>
		<form action="/oauth/approve" method="post" className="mt-6 space-y-7" onSubmit={(event) => void submit(event)}>
			<input type="hidden" name="request" value={ticket} />
			<fieldset className="space-y-3"><legend className="mb-3 text-sm font-semibold">{t("oauth.permissions")}</legend>
				{scopes.map((scope) => <label key={scope} className="flex items-start gap-3 text-sm"><Checkbox name="scope" value={scope} checked={selectedScopes.includes(scope)} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedScopes((current) => checked ? [...current, scope] : current.filter((item) => item !== scope)); }} /><span>{t(`oauth.scope.${scope}` as Parameters<typeof t>[0])}</span></label>)}
			</fieldset>
			{mailboxes.length > 0 && <fieldset className="space-y-3"><legend className="mb-3 text-sm font-semibold">{t("oauth.chooseMailboxes")}</legend>{mailboxes.map((mailbox) => <label key={mailbox.id} className="flex items-start gap-3 text-sm"><Checkbox name="mailbox" value={mailbox.id} checked={selectedMailboxes.includes(mailbox.id)} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedMailboxes((current) => checked ? [...current, mailbox.id] : current.filter((item) => item !== mailbox.id)); }} /><span className="min-w-0 break-all">{mailbox.address}</span></label>)}</fieldset>}
			{needsMailbox && !selectedMailboxes.length && <p className="text-sm text-neutral-600">{t("oauth.mailboxRequired")}</p>}
			<p className="text-sm text-neutral-600">{t("oauth.sendApproval")}</p>
			<p className="text-sm text-neutral-600">{t("oauth.revokeHint")}</p>
			<p className="break-words text-sm text-neutral-600">{t("oauth.returnTo", { host: redirectHost })}</p>
			{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
			<div className="flex flex-wrap gap-3"><Button type="submit" name="decision" value="allow" disabled={busy || !selectedScopes.some((scope) => scope !== "offline_access") || (needsMailbox && !selectedMailboxes.length)}>{t("oauth.allow")}</Button><Button type="submit" variant="outline" name="decision" value="deny" disabled={busy}>{t("oauth.deny")}</Button></div>
		</form>
	</main>;
}
