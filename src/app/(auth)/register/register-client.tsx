"use client";
import { ArrowRight, CheckCircle2, MailPlus, XCircle } from "lucide-react";
import { useEffect, useState, useEffectEvent } from "react";

import Link from "@/components/app-link";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { TurnstileField } from "@/components/auth/turnstile";
import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldGroup,
	FieldLabel,
	FieldDescription,
	FieldContent,
	FieldSet,
	FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupInput,
	InputGroupAddon,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { withCleanup } from "@/lib/async-cleanup";
import { useRouter } from "@/lib/navigation";

import type {
	DomainPreflight,
	DomainSetupResult,
	SetupRequirementCheck,
} from "./types";
import {
	getSetupStatus,
	checkExistingMx,
	prepareSetup,
	submitPrimaryDomain,
	submitRegistration,
} from "./utils";

export function RegisterClient() {
	const { t } = useLanguage();
	const router = useRouter();
	const [hasAdminAccount, setHasAdminAccount] = useState<boolean | null>(null);
	const [hasPrimaryDomain, setHasPrimaryDomain] = useState<boolean | null>(
		null
	);
	const [primaryDomain, setPrimaryDomain] = useState<string | null>(null);
	const [primaryDomainSendingRequested, setPrimaryDomainSendingRequested] =
		useState<boolean | null>(null);
	const [setupDomain, setSetupDomain] = useState<string | null>(null);
	const [domainCheck, setDomainCheck] = useState<DomainPreflight | null>(null);
	const [domainChecking, setDomainChecking] = useState(false);
	const [enableSending, setEnableSending] = useState(false);
	const [setupEnableSending, setSetupEnableSending] = useState(false);
	const [skipDns, setSkipDns] = useState(false);
	const [setupSkipDns, setSetupSkipDns] = useState(false);
	const [step, setStep] = useState<1 | 2 | 3>(1);
	const [checks, setChecks] = useState<SetupRequirementCheck[]>([]);
	const [databaseMigrated, setDatabaseMigrated] = useState(false);
	const [preparationComplete, setPreparationComplete] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mxChecking, setMxChecking] = useState(true);
	const [mxRecordsExist, setMxRecordsExist] = useState<boolean | null>(null);
	const [replaceMxRecords, setReplaceMxRecords] = useState(false);
	const [mxCheckRevision, setMxCheckRevision] = useState(0);
	const [loading, setLoading] = useState(true);
	const [turnstileReset, setTurnstileReset] = useState(0);

	function applyPreparation(
		preparation: Awaited<ReturnType<typeof prepareSetup>>
	) {
		return withCleanup(
			async () => {
				try {
					setChecks(preparation.data.checks ?? []);
					setDatabaseMigrated(!!preparation.data.migrated);
					if (!preparation.ok) {
						setError(preparation.data.error ?? t("setup.completeConfig"));
						return;
					}

					const data = await getSetupStatus();
					setHasAdminAccount(data.hasAdminAccount);
					setHasPrimaryDomain(data.hasPrimaryDomain);
					setPrimaryDomain(data.primaryDomain?.hostname ?? null);
					setPrimaryDomainSendingRequested(
						data.primaryDomain?.sendingRequested ?? null
					);
					setPreparationComplete(true);
				} catch (error_) {
					setError(
						error_ instanceof Error ? error_.message : t("setup.prepFailed")
					);
				}
			},
			() => {
				setLoading(false);
			}
		);
	}

	function handlePreparationError(preparationError: unknown) {
		setLoading(false);
		setError(
			preparationError instanceof Error
				? preparationError.message
				: t("setup.prepFailed")
		);
	}
	function runPreparation() {
		setLoading(true);
		setError(null);
		setPreparationComplete(false);
		return prepareSetup().then(applyPreparation).catch(handlePreparationError);
	}
	const applyInitialPreparation = useEffectEvent(applyPreparation);
	const reportInitialFailure = useEffectEvent(handlePreparationError);

	useEffect(() => {
		async function initialize() {
			try {
				const result = await prepareSetup();
				await applyInitialPreparation(result);
			} catch (preparationError) {
				reportInitialFailure(preparationError);
			}
		}
		void initialize();
	}, []);

	const accountDomain = setupDomain ?? primaryDomain;

	const mxKey = `${step}:${accountDomain}:${mxCheckRevision}:${setupSkipDns}`;
	const [previousMxKey, setPreviousMxKey] = useState(mxKey);
	if (previousMxKey !== mxKey) {
		setPreviousMxKey(mxKey);
		setMxChecking(!setupSkipDns);
		setMxRecordsExist(setupSkipDns ? false : null);
		setReplaceMxRecords(false);
		setError(null);
	}

	useEffect(() => {
		if (step !== 3 || !accountDomain) {
			return;
		}
		if (setupSkipDns) {
			return;
		}
		let active = mxCheckRevision >= 0;
		void mxCheckRevision;
		void checkExistingMx(accountDomain)
			.then(({ ok, data }) => {
				if (!active) {
					return;
				}
				setMxChecking(false);
				if (!ok || data.hasExistingMx === undefined) {
					setError(
						typeof data.error === "string"
							? data.error
							: t("setup.mxCheckFailed")
					);
					return;
				}
				setMxRecordsExist(data.hasExistingMx);

				return null;
			})
			.catch((error_: unknown) => {
				if (!active) {
					return;
				}
				setMxChecking(false);
				setError(
					error_ instanceof Error ? error_.message : t("setup.mxCheckFailed")
				);
			});

		return () => {
			active = false;
		};
	}, [step, accountDomain, mxCheckRevision, setupSkipDns, t]);

	async function onDomainSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setError(null);

		const hostname = String(new FormData(e.currentTarget).get("domain") ?? "")
			.toLowerCase()
			.trim();
		if (skipDns) {
			setLoading(false);
			setSetupDomain(hostname);
			setSetupEnableSending(true);
			setSetupSkipDns(true);
			setStep(3);
			return;
		}
		setSetupSkipDns(false);
		const usedCachedCheck = domainCheck?.hostname === hostname;
		const result: { ok: boolean; data: DomainSetupResult } = usedCachedCheck
			? { data: { domain: domainCheck }, ok: true }
			: await submitPrimaryDomain(hostname);
		const { ok, data } = result;
		setLoading(false);
		if (!ok || !data.domain) {
			setError(
				typeof data.error === "string" ? data.error : t("setup.domainFailed")
			);
			return;
		}
		setSetupDomain(data.domain.hostname);
		setSetupEnableSending(usedCachedCheck ? enableSending : false);
		setStep(3);
	}

	async function onDomainBlur(e: React.FocusEvent<HTMLInputElement>) {
		const hostname = e.currentTarget.value.toLowerCase().trim();
		if (skipDns || hostname.length < 3 || domainCheck?.hostname === hostname) {
			return;
		}

		setDomainChecking(true);
		setError(null);
		const { ok, data } = await submitPrimaryDomain(hostname);
		setDomainChecking(false);
		if (!ok || !data.domain) {
			setDomainCheck(null);
			setEnableSending(false);
			setError(
				typeof data.error === "string"
					? data.error
					: t("setup.domainCheckFailed")
			);
			return;
		}

		setDomainCheck(data.domain);
		setEnableSending(false);
	}

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setError(null);

		const form = new FormData(e.currentTarget);
		const domain = setupDomain ?? primaryDomain;
		if (!domain) {
			setLoading(false);
			setError(t("setup.domainIncomplete"));
			return;
		}

		const { ok, data } = await submitRegistration(form, {
			domain,
			enableSending: setupDomain
				? setupEnableSending
				: (primaryDomainSendingRequested ?? undefined),
			firstRun: true,
			replaceMxRecords,
			skipDns: setupDomain ? setupSkipDns : undefined,
		});
		setLoading(false);
		if (!ok) {
			if (data.code === "MX_RECORDS_CONFLICT") {
				setMxRecordsExist(true);
				setReplaceMxRecords(false);
				setError(null);
				setTurnstileReset((value) => value + 1);
				return;
			}
			setError(
				typeof data.error === "string"
					? data.error
					: t("setup.registrationFailed")
			);
			setTurnstileReset((value) => value + 1);
			return;
		}
		window.location.assign(data.redirect ?? "/login");
	}

	const showDomainStep = hasPrimaryDomain === false && step === 2;

	if (hasAdminAccount === true) {
		return (
			<AuthShell
				icon={MailPlus}
				title={t("setup.closedTitle")}
				footer={
					<Link
						href="/login"
						className="inline-flex items-center gap-2 hover:underline"
					>
						{t("setup.signInInstead")}
						<ArrowRight className="size-4" />
					</Link>
				}
			>
				<FieldGroup className="flex-1 [&>button:last-child]:mt-auto lg:[&>button:last-child]:mt-0">
					<p className="text-sm leading-6 text-muted-foreground">
						{t("setup.alreadyHasAccount", {
							domain: primaryDomain ?? t("setup.thisWorkspace"),
						})}
					</p>
					<Button
						type="button"
						size="lg"
						className="w-full"
						onClick={() => router.push("/login")}
					>
						{t("setup.goToLogin")}
					</Button>
				</FieldGroup>
			</AuthShell>
		);
	}
	return (
		<AuthShell
			icon={MailPlus}
			title={(() => {
				if (step === 1) {
					return t("setup.prepareTitle");
				}
				if (showDomainStep) {
					return t("setup.addDomainTitle");
				}
				return t("setup.createMailboxTitle");
			})()}
			// description={
			// 	showDomainStep
			// 		? "Connect the primary Cloudflare zone first so routing records can be created before the first mailbox."
			// 		: `Choose a mailbox username on ${accountDomain ?? "the primary domain"} and add a recovery email.`
			// }
			steps={[
				{ active: step === 1, label: t("setup.stepSystem") },
				{ active: step === 2, label: t("setup.stepDomain") },
				{ active: step === 3, label: t("setup.stepAccount") },
			]}
		>
			{(() => {
				if (step === 1) {
					return (
						<FieldGroup className="flex-1 [&>button:last-child]:mt-auto lg:[&>button:last-child]:mt-0">
							<p className="text-sm leading-6 text-muted-foreground">
								{t("setup.prepareIntro")}
							</p>
							<div className="flex flex-col gap-2">
								{loading && checks.length === 0 && (
									<Alert variant="muted">
										<Spinner />
										<AlertDescription>{t("setup.checking")}</AlertDescription>
									</Alert>
								)}
								{checks.map((check) => (
									<div
										key={check.key}
										className="flex items-start gap-3 rounded-lg bg-muted/60 px-4 py-3"
									>
										{check.configured ? (
											<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
										) : (
											<XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
										)}
										<div>
											<p className="text-sm font-medium text-foreground">
												{check.key}
											</p>
											{!check.configured && (
												<FieldDescription>{check.message}</FieldDescription>
											)}
										</div>
									</div>
								))}
								{preparationComplete && (
									<Alert variant="success">
										<CheckCircle2 />
										<AlertDescription>
											{databaseMigrated
												? t("setup.migrated")
												: t("setup.schemaReady")}
										</AlertDescription>
									</Alert>
								)}
							</div>
							{error && (
								<Alert id="auth-error" variant="error">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}
							{preparationComplete ? (
								<Button
									type="button"
									size="lg"
									className="w-full"
									onClick={() => setStep(hasPrimaryDomain ? 3 : 2)}
								>
									{t("common.continue")}
								</Button>
							) : (
								<Button
									type="button"
									variant="outline"
									size="lg"
									className="w-full"
									disabled={loading}
									onClick={() => runPreparation()}
								>
									{loading && <Spinner data-icon="inline-start" />}
									{loading ? t("setup.checkingShort") : t("setup.checkAgain")}
								</Button>
							)}
						</FieldGroup>
					);
				}

				function renderDomainStep() {
					return (
						<form
							method="post"
							onSubmit={onDomainSubmit}
							className="flex flex-col"
						>
							<FieldGroup className="flex-1 [&>button[type=submit]]:mt-auto lg:[&>button[type=submit]]:mt-0">
								<Field data-invalid={!!error}>
									<FieldLabel htmlFor="domain">
										{t("setup.primaryDomain")}
									</FieldLabel>
									<Input
										aria-describedby={error ? "auth-error" : undefined}
										aria-invalid={!!error}
										id="domain"
										inputMode="url"
										autoComplete="off"
										autoCapitalize="none"
										spellCheck={false}
										name="domain"
										placeholder="example.com"
										required
										onBlur={(event) => onDomainBlur(event)}
										onChange={(event) => {
											if (
												domainCheck?.hostname !==
												event.currentTarget.value.toLowerCase().trim()
											) {
												setDomainCheck(null);
												setEnableSending(false);
											}
										}}
									/>
									<FieldDescription>{t("setup.zoneHint")}</FieldDescription>
								</Field>
								<Field orientation="horizontal" className="p-4">
									<FieldContent>
										<FieldLabel htmlFor="setup-skip-dns">
											{t("setup.skipDns")}
										</FieldLabel>
										<FieldDescription>
											{skipDns ? t("setup.skipDnsOn") : t("setup.skipDnsHint")}
										</FieldDescription>
									</FieldContent>
									<Switch
										id="setup-skip-dns"
										checked={skipDns}
										onCheckedChange={(checked) => {
											setSkipDns(checked);
											setError(null);
										}}
									/>
								</Field>
								{!skipDns && (
									<Field orientation="horizontal" className="p-4">
										<FieldContent>
											<FieldLabel htmlFor="setup-enable-sending">
												{t("setup.enableSending")}
											</FieldLabel>
											<FieldDescription>
												{(() => {
													if (domainChecking) {
														return t("setup.checkingCloudflare");
													}
													if (domainCheck) {
														if (enableSending) {
															return t("setup.requiredToSend");
														}
														return t("setup.receiveOnly");
													}
													return t("setup.enterDomain");
												})()}
											</FieldDescription>
										</FieldContent>
										<Switch
											id="setup-enable-sending"
											checked={enableSending}
											onCheckedChange={setEnableSending}
											disabled={domainChecking || !domainCheck || skipDns}
										/>
									</Field>
								)}
								{domainCheck && !skipDns && (
									<Alert variant="success">
										<CheckCircle2 />
										<AlertDescription>
											{t("setup.domainFound", { zone: domainCheck.zone.name })}
										</AlertDescription>
									</Alert>
								)}
								{error && (
									<Alert id="auth-error" variant="error">
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								)}
								<Button
									type="submit"
									size="lg"
									className="w-full"
									disabled={loading || domainChecking}
								>
									{loading && <Spinner data-icon="inline-start" />}
									{loading ? t("setup.addingDomain") : t("common.continue")}
								</Button>
							</FieldGroup>
						</form>
					);
				}
				if (showDomainStep) {
					return renderDomainStep();
				}

				function renderCreateAccountButton() {
					return (
						<Button
							type="submit"
							size="lg"
							className="w-full"
							disabled={
								loading ||
								mxChecking ||
								mxRecordsExist === null ||
								(mxRecordsExist && !replaceMxRecords) ||
								hasAdminAccount === null ||
								hasPrimaryDomain === null
							}
						>
							{loading && <Spinner data-icon="inline-start" />}
							{loading ? t("setup.creating") : t("setup.createAccount")}
						</Button>
					);
				}

				function renderAccountStep() {
					return (
						<form method="post" onSubmit={onSubmit} className="flex flex-col">
							<FieldGroup className="flex-1 [&>button[type=submit]]:mt-auto lg:[&>button[type=submit]]:mt-0">
								{mxChecking && (
									<Alert variant="muted">
										<Spinner />
										<AlertDescription>{t("setup.checkingMx")}</AlertDescription>
									</Alert>
								)}
								{mxRecordsExist === false && (
									<Alert variant="success">
										<CheckCircle2 />
										<AlertDescription>{t("setup.noMx")}</AlertDescription>
									</Alert>
								)}
								{mxRecordsExist === true && (
									<FieldSet className=" ">
										<FieldLegend className="sr-only">
											{t("setup.replaceMx")}
										</FieldLegend>
										<Field orientation="horizontal">
											<Checkbox
												id="replace-mx"
												checked={replaceMxRecords}
												onCheckedChange={(checked) =>
													setReplaceMxRecords(checked === true)
												}
											/>
											<FieldContent>
												<FieldLabel htmlFor="replace-mx">
													{t("setup.replaceMx")}
												</FieldLabel>
												<FieldDescription>
													{t("setup.replaceMxHint")}
												</FieldDescription>
											</FieldContent>
										</Field>
									</FieldSet>
								)}
								<Field data-invalid={!!error}>
									<FieldLabel htmlFor="username">
										{t("setup.username")}
									</FieldLabel>
									<InputGroup>
										<InputGroupInput
											aria-describedby={error ? "auth-error" : undefined}
											aria-invalid={!!error}
											id="username"
											autoCapitalize="none"
											spellCheck={false}
											name="username"
											placeholder={t("setup.usernamePlaceholder")}
											autoComplete="username"
											required
										/>
										<InputGroupAddon align="inline-end" className="max-w-36">
											@{accountDomain ?? t("setup.domainFallback")}
										</InputGroupAddon>
									</InputGroup>
								</Field>
								<Field data-invalid={!!error}>
									<FieldLabel htmlFor="password">
										{t("auth.password")}
									</FieldLabel>
									<PasswordInput
										aria-describedby={error ? "auth-error" : undefined}
										aria-invalid={!!error}
										id="password"
										name="password"
										minLength={8}
										autoComplete="new-password"
										required
									/>
								</Field>

								<Field data-invalid={!!error}>
									<FieldLabel htmlFor="resetEmail">
										{t("setup.recoveryEmail")}
									</FieldLabel>
									<Input
										aria-describedby={error ? "auth-error" : undefined}
										aria-invalid={!!error}
										id="resetEmail"
										name="resetEmail"
										type="email"
										inputMode="email"
										autoCapitalize="none"
										spellCheck={false}
										autoComplete="email"
										placeholder="you@gmail.com"
										required
									/>
									{/* <FieldDescription>Used later for password reset.</FieldDescription> */}
								</Field>

								{error && (
									<Alert id="auth-error" variant="error">
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								)}
								{!mxChecking && mxRecordsExist === null && (
									<Button
										type="button"
										variant="outline"
										size="lg"
										className="w-full"
										onClick={() => setMxCheckRevision((value) => value + 1)}
									>
										{t("setup.checkMxAgain")}
									</Button>
								)}
								<TurnstileField resetSignal={turnstileReset} />
								{renderCreateAccountButton()}
							</FieldGroup>
						</form>
					);
				}
				return renderAccountStep();
			})()}
		</AuthShell>
	);
}
