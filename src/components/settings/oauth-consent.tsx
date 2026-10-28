"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { FieldLegend, FieldSet, FieldGroup } from "@/components/ui/field";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { DRIVE_SCOPES, EMAIL_SCOPES } from "@/lib/oauth/config";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
export function ConsentForm({
	ticket,
	name,
	redirectHost,
	email,
	scopes,
	mailboxes,
}: {
	ticket: string;
	name: string;
	redirectHost: string;
	email: string;
	scopes: string[];
	mailboxes: {
		id: string;
		address: string;
	}[];
}) {
	const { t } = useLanguage();
	const [selectedScopes, setSelectedScopes] = useState(scopes);
	const [selectedMailboxes, setSelectedMailboxes] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const submitter = (event.nativeEvent as SubmitEvent)
			.submitter as HTMLButtonElement | null;
		const body = new URLSearchParams();
		for (const [key, value] of new FormData(event.currentTarget))
			body.append(key, String(value));
		body.set("decision", submitter?.value ?? "deny");
		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/oauth/approve", { method: "POST", body });
			const data = (await response.json()) as {
				redirectTo?: string;
				error_description?: string;
			};
			if (!response.ok || !data.redirectTo)
				throw new Error(data.error_description || t("oauth.connectionError"));
			window.location.assign(data.redirectTo);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : t("oauth.connectionError"),
			);
			setBusy(false);
		}
	}
	const needsMailbox = selectedScopes.some((scope) =>
		EMAIL_SCOPES.includes(scope),
	);
	const scopeBox = (scope: string) => (
		<Field key={scope} orientation="horizontal">
			<FieldLabel className="min-h-11 w-full items-center">
				<Checkbox
					name="scope"
					value={scope}
					checked={selectedScopes.includes(scope)}
					onCheckedChange={(value) => {
						const checked = value === true;
						setSelectedScopes((current) =>
							checked
								? [...current, scope]
								: current.filter((item) => item !== scope),
						);
					}}
				/>
				<span>{t(`oauth.scope.${scope}` as Parameters<typeof t>[0])}</span>
			</FieldLabel>
		</Field>
	);
	// Group requested permissions by product area so mail, Drive and admin access read as separate decisions.
	const groups = [
		{
			key: "email",
			scopes: scopes.filter((scope) => EMAIL_SCOPES.includes(scope)),
		},
		{
			key: "drive",
			scopes: scopes.filter((scope) => DRIVE_SCOPES.includes(scope)),
		},
		{
			key: "calendar",
			scopes: scopes.filter((scope) => scope.startsWith("mcp:calendar-")),
		},
		{
			key: "admin",
			scopes: scopes.filter(
				(scope) => !scope.startsWith("mcp:") && scope !== "offline_access",
			),
		},
		{
			key: "access",
			scopes: scopes.filter((scope) => scope === "offline_access"),
		},
	].filter((group) => group.scopes.length > 0);
	return (
		<main className="mx-auto w-full max-w-xl px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 sm:py-16 [&_button:not([role=checkbox])]:min-h-11">
			<h1 className="text-2xl font-medium text-foreground">
				{t("oauth.connectTitle", { name })}
			</h1>
			<p className="mt-3 break-words text-sm text-muted-foreground">
				{t("oauth.signedInAs", { email })}
			</p>
			<p className="mt-5 text-sm text-foreground/80">
				{t("oauth.requestDescription")}
			</p>
			<form
				action="/oauth/approve"
				method="post"
				className="mt-6 flex flex-col gap-7"
				onSubmit={(event) => void submit(event)}
			>
				<FieldGroup>
					<input type="hidden" name="request" value={ticket} />
					<FieldSet>
						<FieldLegend>{t("oauth.permissions")}</FieldLegend>
						<div className="flex flex-col gap-6">
							{groups.map((group) => (
								<div
									key={group.key}
									role="group"
									aria-labelledby={`oauth-group-${group.key}`}
									className="flex flex-col gap-2 px-4 py-3"
								>
									<p
										id={`oauth-group-${group.key}`}
										className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
									>
										{t(`oauth.group.${group.key}` as Parameters<typeof t>[0])}
									</p>
									{group.scopes.map(scopeBox)}
									{/* Mailboxes only scope email permissions; hiding them when email is off keeps them out of the grant. */}
									{group.key === "email" &&
										needsMailbox &&
										mailboxes.length > 0 && (
											<FieldSet>
												<FieldLegend>{t("oauth.chooseMailboxes")}</FieldLegend>
												{mailboxes.map((mailbox) => (
													<Field key={mailbox.id} orientation="horizontal">
														<FieldLabel className="min-h-11 w-full items-center">
															<Checkbox
																name="mailbox"
																value={mailbox.id}
																checked={selectedMailboxes.includes(mailbox.id)}
																onCheckedChange={(value) => {
																	const checked = value === true;
																	setSelectedMailboxes((current) =>
																		checked
																			? [...current, mailbox.id]
																			: current.filter(
																					(item) => item !== mailbox.id,
																				),
																	);
																}}
															/>
															<span className="min-w-0 break-all">
																{mailbox.address}
															</span>
														</FieldLabel>
													</Field>
												))}
											</FieldSet>
										)}
									{group.key === "email" &&
										needsMailbox &&
										!selectedMailboxes.length && (
											<p className="text-sm text-muted-foreground">
												{t("oauth.mailboxRequired")}
											</p>
										)}
								</div>
							))}
						</div>
					</FieldSet>
					{scopes.includes("mcp:send") && (
						<p className="text-sm text-muted-foreground">
							{t("oauth.sendApproval")}
						</p>
					)}
					<p className="text-sm text-muted-foreground">
						{t("oauth.revokeHint")}
					</p>
					<p className="break-words text-sm text-muted-foreground">
						{t("oauth.returnTo", { host: redirectHost })}
					</p>
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					<div className="flex flex-wrap gap-3">
						<Button
							type="submit"
							name="decision"
							value="allow"
							disabled={
								busy ||
								!selectedScopes.some((scope) => scope !== "offline_access") ||
								(needsMailbox && !selectedMailboxes.length)
							}
						>
							{t("oauth.allow")}
						</Button>
						<Button
							type="submit"
							variant="outline"
							name="decision"
							value="deny"
							disabled={busy}
						>
							{t("oauth.deny")}
						</Button>
					</div>
				</FieldGroup>
			</form>
		</main>
	);
}
