"use client";

import { Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";

import Link from "@/components/app-link";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { TurnstileField } from "@/components/auth/turnstile";
import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { withCleanup } from "@/lib/async-cleanup";
import { useRouter } from "@/lib/navigation";

import { submitLogin, submitMfaCode } from "./utils";

export function LoginClient({
	adding = false,
	returnTo,
}: {
	adding?: boolean;
	returnTo?: string;
}) {
	const { t } = useLanguage();
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [turnstileReset, setTurnstileReset] = useState(0);
	// Set once the password is accepted for an account with a second factor.
	const [challengeToken, setChallengeToken] = useState<string | null>(null);
	const [code, setCode] = useState("");

	function finish(redirect?: string) {
		if (returnTo) {
			// Authorization is an HTTP endpoint, so resume it with a document request.
			window.location.replace(returnTo);
			return;
		}
		router.replace(redirect ?? "/inbox");
		router.refresh();
	}

	function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		setError(null);

		return withCleanup(
			async () => {
				try {
					const { ok, data } = await submitLogin(new FormData(e.currentTarget));
					if (!ok) {
						setError(data.error ?? t("auth.loginFailed"));
						setTurnstileReset((value) => value + 1);
						return;
					}
					if (data.mfaRequired && data.challengeToken) {
						setChallengeToken(data.challengeToken);
						return;
					}
					finish(data.redirect);
				} catch (error_) {
					setError(
						error_ instanceof DOMException && error_.name === "TimeoutError"
							? t("auth.loginTimeout")
							: t("auth.loginUnreachable")
					);
					setTurnstileReset((value) => value + 1);
				}
			},
			() => {
				setLoading(false);
			}
		);
	}

	function onSubmitCode(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!challengeToken) {
			return;
		}
		setLoading(true);
		setError(null);
		return withCleanup(
			async () => {
				try {
					const { ok, data } = await submitMfaCode(challengeToken, code);
					if (!ok) {
						setError(data.error ?? t("auth.codeMismatch"));
						// An expired challenge sends the user back to the password step.
						if (data.error?.includes("expired")) {
							setChallengeToken(null);
							setCode("");
						}
						return;
					}
					finish(data.redirect);
				} catch {
					setError(t("auth.loginUnreachable"));
				}
			},
			() => {
				setLoading(false);
			}
		);
	}

	if (challengeToken) {
		return (
			<AuthShell
				icon={ShieldCheck}
				title={t("auth.mfaTitle")}
				description={t("auth.mfaDescription")}
			>
				<form onSubmit={onSubmitCode} className="flex flex-col">
					<FieldGroup className="flex-1 [&>button[type=submit]]:mt-auto lg:[&>button[type=submit]]:mt-0">
						<Field data-invalid={!!error}>
							<FieldLabel htmlFor="code">{t("auth.code")}</FieldLabel>
							<Input
								aria-describedby={error ? "auth-error" : undefined}
								aria-invalid={!!error}
								id="code"
								name="code"
								value={code}
								onChange={(event) => setCode(event.target.value)}
								className="text-center"
								inputMode="numeric"
								autoComplete="one-time-code"
								autoFocus
								placeholder="123 456"
								required
							/>
						</Field>
						{error && (
							<Alert id="auth-error" variant="error">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<Button
							type="submit"
							size="lg"
							className="w-full"
							disabled={loading}
						>
							{loading && <Spinner data-icon="inline-start" />}
							{loading ? t("auth.verifying") : t("auth.verify")}
						</Button>
						<Button
							variant="ghost"
							type="button"
							className="w-full"
							onClick={() => {
								setChallengeToken(null);
								setCode("");
								setError(null);
							}}
						>
							{t("auth.backToSignIn")}
						</Button>
					</FieldGroup>
				</form>
			</AuthShell>
		);
	}

	return (
		<AuthShell
			icon={Mail}
			title={adding ? t("auth.addAnother") : t("auth.signIn")}
			description={
				adding ? t("auth.addDescription") : t("auth.signInDescription")
			}
		>
			<form method="post" onSubmit={onSubmit} className="flex flex-col">
				<FieldGroup className="flex-1 [&>button[type=submit]]:mt-auto lg:[&>button[type=submit]]:mt-0">
					<Field data-invalid={!!error}>
						<FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
						<Input
							id="email"
							name="email"
							type="email"
							inputMode="email"
							autoCapitalize="none"
							spellCheck={false}
							autoComplete="email"
							aria-invalid={error ? true : undefined}
							aria-describedby={error ? "login-error" : undefined}
							required
						/>
					</Field>
					<Field data-invalid={!!error}>
						<div className="flex items-center justify-between">
							<FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
							<Link
								href="/forgot-password"
								className="text-xs font-medium text-signal hover:underline"
							>
								{t("auth.forgotPassword")}
							</Link>
						</div>
						<PasswordInput
							id="password"
							name="password"
							autoComplete="current-password"
							aria-invalid={error ? true : undefined}
							aria-describedby={error ? "login-error" : undefined}
							required
						/>
					</Field>
					{error && (
						<Alert id="login-error" variant="error">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					<TurnstileField resetSignal={turnstileReset} />
					<Button type="submit" size="lg" className="w-full" disabled={loading}>
						{loading && <Spinner data-icon="inline-start" />}
						{loading ? t("auth.signingIn") : t("auth.signIn")}
					</Button>
				</FieldGroup>
			</form>
		</AuthShell>
	);
}
