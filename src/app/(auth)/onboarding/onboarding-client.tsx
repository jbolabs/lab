"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	MailPlus,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupInput,
	InputGroupAddon,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import {
	Field,
	FieldGroup,
	FieldLabel,
	FieldDescription,
	FieldContent,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { checkDomain, createDomain, createMailbox, getDomains } from "./utils";
import type { DomainPreflight } from "./types";

export function OnboardingClient() {
	const { t } = useLanguage();
	const router = useRouter();
	const [step, setStep] = useState<1 | 2>(1);
	const [hostname, setHostname] = useState("");
	const [domainCheck, setDomainCheck] = useState<DomainPreflight | null>(null);
	const [domainChecking, setDomainChecking] = useState(false);
	const [enableSending, setEnableSending] = useState(false);
	const [skipDns, setSkipDns] = useState(false);
	const [domainId, setDomainId] = useState("");
	const [localPart, setLocalPart] = useState("me");
	const [error, setError] = useState<string | null>(null);
	const [mxConflict, setMxConflict] = useState(false);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		void getDomains()
			.then((data) => {
				const primary = data.domains?.[0];
				if (!primary) return;
				setDomainId(primary.id);
				setHostname(primary.hostname);
				setStep(2);
			})
			.catch(() => undefined);
	}, []);

	async function addDomain(replaceMxRecords = false) {
		setLoading(true);
		setError(null);

		const normalized = hostname.toLowerCase().trim();
		let checkedDomain = domainCheck;
		let sendingRequested = enableSending;
		if (skipDns) {
			checkedDomain = {
				hostname: normalized,
				zone: { id: "manual", name: normalized },
			};
		} else if (checkedDomain?.hostname !== normalized) {
			const result = await checkDomain(normalized);
			if (!result.ok || !result.domain) {
				setLoading(false);
				setError(result.error ?? t("onboarding.domainCheckFailed"));
				return;
			}
			checkedDomain = result.domain;
			sendingRequested = false;
			setDomainCheck(result.domain);
			setEnableSending(sendingRequested);
		}
		if (!checkedDomain) {
			setLoading(false);
			setError(t("onboarding.domainCheckFailed"));
			return;
		}

		const { ok, data } = await createDomain(
			checkedDomain.hostname,
			skipDns ? true : sendingRequested,
			replaceMxRecords,
			skipDns,
		);
		setLoading(false);
		if (!ok || !data.domain) {
			if (data.code === "MX_RECORDS_CONFLICT") {
				setMxConflict(true);
				setError(null);
				return;
			}
			setError(data.error ?? t("onboarding.addDomainFailed"));
			return;
		}
		setMxConflict(false);
		setDomainId(data.domain.id);
		setStep(2);
	}

	async function inspectDomain() {
		const normalized = hostname.toLowerCase().trim();
		if (
			skipDns ||
			normalized.length < 3 ||
			domainCheck?.hostname === normalized
		)
			return;

		setDomainChecking(true);
		setError(null);
		setMxConflict(false);
		const result = await checkDomain(normalized);
		setDomainChecking(false);
		if (!result.ok || !result.domain) {
			setDomainCheck(null);
			setEnableSending(false);
			setError(result.error ?? t("onboarding.domainCheckFailed"));
			return;
		}

		setDomainCheck(result.domain);
		setEnableSending(false);
	}

	async function addMailbox() {
		setLoading(true);
		setError(null);

		const { ok, data } = await createMailbox(domainId, localPart);
		setLoading(false);
		if (!ok) {
			setError(data.error ?? t("onboarding.createMailboxFailed"));
			return;
		}
		router.push("/inbox");
	}

	return (
		<AuthShell
			icon={MailPlus}
			title={
				step === 1
					? t("onboarding.connectTitle")
					: t("onboarding.firstMailboxTitle")
			}
			description={
				step === 1
					? t("onboarding.connectDescription")
					: t("onboarding.mailboxDescription")
			}
			steps={[
				{ label: t("onboarding.stepDomain"), active: step === 1 },
				{ label: t("onboarding.stepMailbox"), active: step === 2 },
			]}
			footer={
				<span className="inline-flex items-center gap-2 text-muted-foreground">
					{t("onboarding.completesInInbox")}
					<ArrowRight className="size-4" />
				</span>
			}
		>
			<FieldGroup className="flex-1 gap-5 [&>button:last-of-type]:mt-auto lg:[&>button:last-of-type]:mt-0">
				{step === 1 && (
					<>
						<Alert>
							<AlertDescription>
								<p>
									{t("onboarding.cloudflareDns", { token: "\u0001" })
										.split("\u0001")
										.flatMap((part, index) =>
											index === 0
												? [part]
												: [
														<code
															key={index}
															className="font-mono text-xs font-semibold text-signal-soft-foreground"
														>
															CF_TOKEN
														</code>,
														part,
													],
										)}
								</p>
							</AlertDescription>
						</Alert>
						<Field data-invalid={!!error}>
							<FieldLabel htmlFor="domain">{t("onboarding.domain")}</FieldLabel>
							<Input
								aria-describedby={error ? "auth-error" : undefined}
								aria-invalid={!!error}
								id="domain"
								inputMode="url"
								autoComplete="off"
								autoCapitalize="none"
								spellCheck={false}
								value={hostname}
								onChange={(e) => {
									setHostname(e.target.value);
									if (
										domainCheck?.hostname !==
										e.target.value.toLowerCase().trim()
									) {
										setDomainCheck(null);
										setEnableSending(false);
										setMxConflict(false);
									}
								}}
								onBlur={() => void inspectDomain()}
								placeholder="example.com"
							/>
						</Field>
						<Field orientation="horizontal" className="rounded-lg border p-4">
							<FieldContent>
								<FieldLabel
									className="min-h-11 items-center"
									htmlFor="onboarding-skip-dns"
								>
									{t("setup.skipDns")}
								</FieldLabel>
								<FieldDescription>
									{skipDns ? t("setup.skipDnsOn") : t("setup.skipDnsHint")}
								</FieldDescription>
							</FieldContent>
							<Switch
								id="onboarding-skip-dns"
								checked={skipDns}
								onCheckedChange={(checked) => {
									setSkipDns(checked);
									setMxConflict(false);
									setError(null);
								}}
							/>
						</Field>
						{!skipDns && (
							<Field orientation="horizontal" className="rounded-lg border p-4">
								<FieldContent>
									<FieldLabel
										className="min-h-11 items-center"
										htmlFor="onboarding-enable-sending"
									>
										{t("setup.enableSending")}
									</FieldLabel>
									<FieldDescription>
										{domainChecking
											? t("setup.checkingCloudflare")
											: domainCheck
												? enableSending
													? t("setup.requiredToSend")
													: t("setup.receiveOnly")
												: t("onboarding.leaveToVerify")}
									</FieldDescription>
								</FieldContent>
								{domainChecking ? (
									<Spinner />
								) : (
									<Switch
										id="onboarding-enable-sending"
										checked={enableSending}
										onCheckedChange={setEnableSending}
										disabled={!domainCheck || skipDns}
									/>
								)}
							</Field>
						)}
						{domainCheck && !skipDns && (
							<Alert>
								<CheckCircle2 className="size-4" />
								<AlertDescription>
									{t("setup.domainFound", { zone: domainCheck.zone.name })}
								</AlertDescription>
							</Alert>
						)}
						{mxConflict && (
							<Alert>
								<AlertDescription className="gap-4">
									<div className="flex items-start gap-3">
										<AlertTriangle className="mt-0.5 size-4 shrink-0" />
										<p className="text-sm leading-6">
											{t("onboarding.mxConflict")}
										</p>
									</div>
									<Button
										onClick={() => void addDomain(true)}
										disabled={loading}
										className="min-h-12 w-full"
									>
										{loading && <Spinner data-icon="inline-start" />}
										{loading
											? t("onboarding.replacingMx")
											: t("onboarding.deleteMxContinue")}
									</Button>
								</AlertDescription>
							</Alert>
						)}
						{!mxConflict && (
							<Button
								onClick={() => void addDomain()}
								disabled={!hostname || loading || domainChecking}
								className="min-h-12 w-full"
							>
								{loading && <Spinner data-icon="inline-start" />}
								{loading ? t("onboarding.adding") : t("onboarding.addDomain")}
							</Button>
						)}
					</>
				)}
				{step === 2 && (
					<>
						<Field data-invalid={!!error}>
							<FieldLabel htmlFor="localPart">
								{t("onboarding.mailboxAddress")}
							</FieldLabel>
							<InputGroup>
								<InputGroupInput
									aria-describedby={error ? "auth-error" : undefined}
									aria-invalid={!!error}
									id="localPart"
									autoComplete="username"
									autoCapitalize="none"
									spellCheck={false}
									value={localPart}
									onChange={(e) => setLocalPart(e.target.value)}
									className="min-w-0"
								/>
								<InputGroupAddon
									align="inline-end"
									className="max-w-36 truncate"
								>
									@{hostname}
								</InputGroupAddon>
							</InputGroup>
						</Field>
						<Button
							onClick={addMailbox}
							disabled={!localPart || loading}
							className="min-h-12 w-full"
						>
							{loading && <Spinner data-icon="inline-start" />}
							{loading ? t("setup.creating") : t("onboarding.goToInbox")}
						</Button>
					</>
				)}
				{error && (
					<Alert id="auth-error" variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
			</FieldGroup>
		</AuthShell>
	);
}
