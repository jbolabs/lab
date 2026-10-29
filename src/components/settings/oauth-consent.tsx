"use client";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldGroup,
} from "@/components/ui/field";
import {
	PageDescription,
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";
import {
	requireSuccessfulResponse,
	requireActionEntity,
} from "@/lib/async-cleanup";
import { DRIVE_SCOPES, EMAIL_SCOPES } from "@/lib/oauth/config";

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
		for (const [key, value] of new FormData(event.currentTarget)) {
			body.append(key, String(value));
		}
		body.set("decision", submitter?.value ?? "deny");
		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/oauth/approve", { body, method: "POST" });
			const data = (await response.json()) as {
				redirectTo?: string;
				error_description?: string;
			};
			const failureMessage =
				data.error_description || t("oauth.connectionError");
			requireSuccessfulResponse(response, failureMessage);
			const redirect = requireActionEntity(
				data.redirectTo ? { url: data.redirectTo } : null,
				failureMessage
			);
			window.location.assign(redirect.url);
		} catch (error_) {
			setError(
				error_ instanceof Error ? error_.message : t("oauth.connectionError")
			);
			setBusy(false);
		}
	}
	const needsMailbox = selectedScopes.some((scope) =>
		EMAIL_SCOPES.includes(scope)
	);
	const scopeBox = (scope: string) => (
		<Field key={scope} orientation="horizontal">
			<FieldLabel className="w-full items-center pointer-coarse:min-h-11">
				<Checkbox
					name="scope"
					value={scope}
					checked={selectedScopes.includes(scope)}
					onCheckedChange={(value) => {
						const checked = value === true;
						setSelectedScopes((current) =>
							checked
								? [...current, scope]
								: current.filter((item) => item !== scope)
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
				(scope) => !scope.startsWith("mcp:") && scope !== "offline_access"
			),
		},
		{
			key: "access",
			scopes: scopes.filter((scope) => scope === "offline_access"),
		},
	].filter((group) => group.scopes.length > 0);
	return (
		<main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 pb-safe-8 sm:py-16">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("oauth.connectTitle", { name })}</PageTitle>
					<PageDescription className="break-words">
						{t("oauth.signedInAs", { email })}
					</PageDescription>
				</PageHeaderText>
			</PageHeader>
			<p className="text-sm text-foreground/80">
				{t("oauth.requestDescription")}
			</p>
			<form
				action="/oauth/approve"
				method="post"
				className="flex flex-col gap-7"
				onSubmit={(event) => submit(event)}
			>
				<FieldGroup>
					<input type="hidden" name="request" value={ticket} />
					<FieldSet>
						<FieldLegend>{t("oauth.permissions")}</FieldLegend>
						<div className="flex flex-col gap-6">
							{groups.map((group) => (
								<fieldset
									key={group.key}

									aria-labelledby={`oauth-group-${group.key}`}
									className="flex flex-col gap-2 px-4 py-3"
								>
									<p
										id={`oauth-group-${group.key}`}
										className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
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
														<FieldLabel className="w-full items-center pointer-coarse:min-h-11">
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
																					(item) => item !== mailbox.id
																				)
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
								</fieldset>
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
					<p className="text-sm break-words text-muted-foreground">
						{t("oauth.returnTo", { host: redirectHost })}
					</p>
					{error && (
						<Alert variant="error">
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
