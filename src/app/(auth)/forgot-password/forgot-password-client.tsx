"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AuthShell } from "@/components/auth/auth-shell";
import { TurnstileField } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { requestPasswordReset } from "./utils";

export function ForgotPasswordClient() {
	const { t } = useLanguage();
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [sent, setSent] = useState(false);
	const [turnstileReset, setTurnstileReset] = useState(0);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setLoading(true);
		setError(null);
		try {
			const result = await requestPasswordReset(
				new FormData(event.currentTarget),
			);
			if (!result.ok) {
				setError(result.error ?? t("auth.forgot.error"));
				setTurnstileReset((value) => value + 1);
				return;
			}
			setSent(true);
		} catch {
			setError(t("auth.serverUnreachable"));
			setTurnstileReset((value) => value + 1);
		} finally {
			setLoading(false);
		}
	}

	return (
		<AuthShell
			icon={KeyRound}
			title={t("auth.forgot.title")}
			description={sent ? t("auth.forgot.sent") : t("auth.forgot.description")}
			footer={
				<Link
					href="/login"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					{t("auth.backToSignIn")}
				</Link>
			}
		>
			{!sent && (
				<form onSubmit={onSubmit} className="flex flex-col">
					<FieldGroup className="flex-1 gap-5 [&>button[type=submit]]:mt-auto lg:[&>button[type=submit]]:mt-0">
						<Field data-invalid={!!error}>
							<FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
							<Input
								aria-describedby={error ? "auth-error" : undefined}
								aria-invalid={!!error}
								id="email"
								name="email"
								type="email"
								inputMode="email"
								autoCapitalize="none"
								spellCheck={false}
								autoComplete="email"
								required
								autoFocus
							/>
						</Field>
						{error && (
							<Alert id="auth-error" variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<TurnstileField resetSignal={turnstileReset} />
						<Button
							type="submit"
							className="min-h-12 w-full"
							disabled={loading}
						>
							{loading && <Spinner data-icon="inline-start" />}
							{loading ? t("auth.sending") : t("auth.sendReset")}
						</Button>
					</FieldGroup>
				</form>
			)}
		</AuthShell>
	);
}
