"use client";

import { Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FieldLabel, Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { withCleanup } from "@/lib/async-cleanup";

import type { MfaDialogStep } from "./mfa-settings-types";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./settings-dialog";
import type { MfaStatusResponse } from "./types";
import {
	beginMfaEnrollment,
	confirmMfaEnrollment,
	disableMfa,
	loadMfaStatus,
	regenerateRecoveryCodes,
} from "./utils";

function RecoveryCodesList({ codes }: { codes: string[] }) {
	const { t } = useLanguage();
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex flex-col gap-3">
			<ul className="grid grid-cols-2 gap-2 py-3 font-mono text-sm text-foreground">
				{codes.map((code) => (
					<li key={code}>{code}</li>
				))}
			</ul>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => {
					navigator.clipboard
						.writeText(codes.join("\n"))
						.then(() => setCopied(true))
						.catch(() => setCopied(false));
				}}
			>
				<Copy data-icon="inline-start" />
				{copied ? t("common.copied") : t("mfa.copyCodes")}
			</Button>
			<p className="text-xs text-muted-foreground">{t("mfa.codesHint")}</p>
		</div>
	);
}

function RecoveryCodesDialog({
	open,
	onOpenChange,
	onDone,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDone: () => Promise<void>;
}) {
	const { t } = useLanguage();
	const [password, setPassword] = useState("");
	const [codes, setCodes] = useState<string[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	async function submit(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					setCodes(await regenerateRecoveryCodes(password));
					setPassword("");
					await onDone();
				} catch (error_) {
					setError(
						error_ instanceof Error ? error_.message : t("mfa.generateFailed")
					);
				}
			},
			() => {
				setBusy(false);
			}
		);
	}
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					setCodes(null);
				}
			}}
		>
			<DialogContent className="max-h-[calc(100dvh_-_4rem)] overflow-y-auto sm:max-w-120">
				{codes ? (
					<div className="flex flex-col gap-4">
						<DialogHeader>
							<DialogTitle>{t("mfa.newCodesTitle")}</DialogTitle>
							<DialogDescription>
								{t("mfa.newCodesDescription")}
							</DialogDescription>
						</DialogHeader>
						<RecoveryCodesList codes={codes} />
						<Button type="button" onClick={() => onOpenChange(false)}>
							{t("common.done")}
						</Button>
					</div>
				) : (
					<form onSubmit={submit}>
						<FieldGroup>
							<DialogHeader>
								<DialogTitle>{t("mfa.generateTitle")}</DialogTitle>
								<DialogDescription>
									{t("mfa.generateDescription")}
								</DialogDescription>
							</DialogHeader>
							<Field>
								<FieldLabel htmlFor="rc-password">
									{t("common.password")}
								</FieldLabel>
								<Input
									id="rc-password"
									type="password"
									autoComplete="current-password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									autoFocus
								/>
							</Field>
							{error && (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}
							<Button type="submit" disabled={busy}>
								{busy ? t("common.pleaseWait") : t("mfa.generate")}
							</Button>
						</FieldGroup>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

function DisableDialog({
	open,
	onOpenChange,
	onDone,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDone: () => Promise<void>;
}) {
	const { t } = useLanguage();
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	async function submit(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					await disableMfa(password, code);
					await onDone();
					onOpenChange(false);
					setPassword("");
					setCode("");
				} catch (error_) {
					setError(
						error_ instanceof Error ? error_.message : t("mfa.turnOffFailed")
					);
				}
			},
			() => {
				setBusy(false);
			}
		);
	}
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-h-[calc(100dvh_-_4rem)] overflow-y-auto sm:max-w-120">
				<form onSubmit={submit}>
					<FieldGroup>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("mfa.turnOffTitle")}</AlertDialogTitle>
							<AlertDialogDescription>
								{t("mfa.turnOffDescription")}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<Field>
							<FieldLabel htmlFor="mfa-off-password">
								{t("common.password")}
							</FieldLabel>
							<Input
								id="mfa-off-password"
								type="password"
								autoComplete="current-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="mfa-off-code">{t("mfa.code")}</FieldLabel>
							<Input
								id="mfa-off-code"
								inputMode="numeric"
								autoComplete="one-time-code"
								value={code}
								onChange={(e) => setCode(e.target.value)}
								required
							/>
						</Field>
						{error && (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<Button type="submit" variant="destructive" disabled={busy}>
							{busy ? t("common.pleaseWait") : t("mfa.turnOff")}
						</Button>
						<AlertDialogCancel disabled={busy}>
							{t("common.cancel")}
						</AlertDialogCancel>
					</FieldGroup>
				</form>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function EnrollDialog({
	open,
	onOpenChange,
	onDone,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDone: () => Promise<void>;
}) {
	const { t } = useLanguage();
	const [step, setStep] = useState<MfaDialogStep>("password");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [qrSvg, setQrSvg] = useState("");
	const [secret, setSecret] = useState("");
	const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	function reset() {
		setStep("password");
		setPassword("");
		setCode("");
		setQrSvg("");
		setSecret("");
		setRecoveryCodes([]);
		setError(null);
	}
	async function start(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const enrollment = await beginMfaEnrollment(password);
					setQrSvg(enrollment.qrSvg);
					setSecret(enrollment.secret);
					setStep("scan");
				} catch (error_) {
					setError(
						error_ instanceof Error ? error_.message : t("mfa.startFailed")
					);
				}
			},
			() => {
				setBusy(false);
			}
		);
	}
	async function confirm(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					setRecoveryCodes(await confirmMfaEnrollment(code));
					setStep("codes");
					await onDone();
				} catch (error_) {
					setError(
						error_ instanceof Error ? error_.message : t("mfa.confirmFailed")
					);
				}
			},
			() => {
				setBusy(false);
			}
		);
	}
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) {
					reset();
				}
			}}
		>
			<DialogContent className="max-h-[calc(100dvh_-_4rem)] overflow-y-auto sm:max-w-120">
				{step === "password" && (
					<form onSubmit={start}>
						<FieldGroup>
							<DialogHeader>
								<DialogTitle>{t("mfa.enrollTitle")}</DialogTitle>
								<DialogDescription>
									{t("mfa.enrollDescription")}
								</DialogDescription>
							</DialogHeader>
							<Field>
								<FieldLabel htmlFor="mfa-password">
									{t("common.password")}
								</FieldLabel>
								<Input
									id="mfa-password"
									type="password"
									autoComplete="current-password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									autoFocus
								/>
							</Field>
							{error && (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}
							<Button type="submit" disabled={busy}>
								{busy ? t("common.pleaseWait") : t("common.continue")}
							</Button>
						</FieldGroup>
					</form>
				)}
				{step === "scan" && (
					<form onSubmit={confirm}>
						<FieldGroup>
							<DialogHeader>
								<DialogTitle>{t("mfa.scanTitle")}</DialogTitle>
								<DialogDescription>
									{t("mfa.scanDescription")}
								</DialogDescription>
							</DialogHeader>
							{/* oxlint-disable-next-line next/no-img-element -- The generated SVG QR is a local data image; no remote optimization is needed. */}
							<img
								alt={t("mfa.scanTitle")}
								className="mx-auto w-48 rounded-lg border bg-card p-2"
								src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`}
							/>
							<details className="text-xs text-muted-foreground">
								<summary className="cursor-pointer">
									{t("mfa.cantScan")}
								</summary>
								<code className="mt-2 block rounded-md bg-muted/60 p-2 font-mono break-all text-foreground">
									{secret}
								</code>
							</details>
							<Field>
								<FieldLabel htmlFor="mfa-code">
									{t("mfa.sixDigitCode")}
								</FieldLabel>
								<Input
									id="mfa-code"
									inputMode="numeric"
									autoComplete="one-time-code"
									value={code}
									onChange={(e) => setCode(e.target.value)}
									placeholder="123 456"
									required
									autoFocus
								/>
							</Field>
							{error && (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}
							<Button type="submit" disabled={busy}>
								{busy ? t("mfa.checking") : t("mfa.verifyAndTurnOn")}
							</Button>
						</FieldGroup>
					</form>
				)}
				{step === "codes" && (
					<div className="flex flex-col gap-4">
						<DialogHeader>
							<DialogTitle>{t("mfa.saveCodesTitle")}</DialogTitle>
							<DialogDescription>
								{t("mfa.saveCodesDescription")}
							</DialogDescription>
						</DialogHeader>
						<RecoveryCodesList codes={recoveryCodes} />
						<Button type="button" onClick={() => onOpenChange(false)}>
							{t("common.done")}
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

/**
 * Settings > Account > Security card for TOTP. Enrolment is a three-step
 * dialog (password, scan and confirm, save recovery codes); turning it off
 * asks for both factors again.
 */
export function MfaSettings() {
	const { t } = useLanguage();
	const [status, setStatus] = useState<MfaStatusResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [enrollOpen, setEnrollOpen] = useState(false);
	const [disableOpen, setDisableOpen] = useState(false);
	const [codesOpen, setCodesOpen] = useState(false);
	useEffect(() => {
		loadMfaStatus()
			.then(setStatus)
			.catch((error_) =>
				setError(error_ instanceof Error ? error_.message : t("mfa.loadFailed"))
			);
	}, [t]);
	async function refresh() {
		setStatus(await loadMfaStatus());
	}
	if (!status) {
		return (
			<p className="text-sm text-muted-foreground">
				{error ?? t("mfa.loading")}
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start gap-3 rounded-lg bg-muted/60 p-4">
				{status.enabled ? (
					<ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
				) : (
					<ShieldOff className="mt-0.5 size-5 shrink-0 text-muted-foreground/70" />
				)}
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<p className="text-sm font-medium text-foreground">
						{status.enabled ? t("mfa.on") : t("mfa.off")}
					</p>
					<p className="text-sm text-muted-foreground">
						{status.enabled
							? t("mfa.onDescription", { count: status.recoveryCodesLeft })
							: t("mfa.offDescription")}
					</p>
				</div>
			</div>
			<div className="flex flex-wrap gap-3">
				{status.enabled ? (
					<>
						<Button variant="outline" onClick={() => setCodesOpen(true)}>
							{t("mfa.newRecoveryCodes")}
						</Button>
						<Button variant="outline" onClick={() => setDisableOpen(true)}>
							{t("mfa.turnOff")}
						</Button>
					</>
				) : (
					<Button onClick={() => setEnrollOpen(true)}>{t("mfa.turnOn")}</Button>
				)}
			</div>

			<EnrollDialog
				open={enrollOpen}
				onOpenChange={setEnrollOpen}
				onDone={refresh}
			/>
			<DisableDialog
				open={disableOpen}
				onOpenChange={setDisableOpen}
				onDone={refresh}
			/>
			<RecoveryCodesDialog
				open={codesOpen}
				onOpenChange={setCodesOpen}
				onDone={refresh}
			/>
		</div>
	);
}
