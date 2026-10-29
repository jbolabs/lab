"use client";
import { useCallback, useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { runAsyncAction } from "@/lib/async-cleanup";
import type { ReceivingStep } from "@/lib/aws/ses-receiving-types";

import { useAdminConfirmation } from "../admin-confirmation-provider";
import { requestJson, runReceivingSetup } from "./api";
import AwsCredentialsPanel from "./aws-credentials-panel";
import ResendKeyRow from "./resend-key-row";
import { StatusRow } from "./status-row";

interface ViewResponse {
	credentials?: boolean;
	view?: {
		steps: ReceivingStep[];
		ready: boolean;
		mx: string | null;
		restrictedKey?: boolean;
	} | null;
	error?: string;
}

interface Props {
	domainId: string;
	provider: "resend" | "ses";
	/** Reports whether the provider is fully ready (null while unknown). */
	onReady?: (ready: boolean | null) => void;
}

const COPY = {
	resend: { hint: "domains.resendReceivingHint" },
	ses: { hint: "domains.sesReceivingHint" },
} as const;

/** Checklist and setup button for receiving through Resend or Amazon SES. */
export default function ReceivingProviderConfig({
	domainId,
	provider,
	onReady,
}: Props) {
	const { t } = useLanguage();
	const confirm = useAdminConfirmation();
	const [credentials, setCredentials] = useState<boolean | null>(null);
	const [view, setView] = useState<ViewResponse["view"]>(null);
	const [loading, setLoading] = useState(true);
	const [reload, setReload] = useState(0);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	useEffect(() => {
		let active = true;
		runAsyncAction(
			async () => {
				const data = await requestJson<
					ViewResponse & { keyConfigured?: boolean }
				>(
					`/api/domains/${domainId}/receiving/${provider}?refresh=${reload}`,
					"GET"
				);
				if (!active) {
					return;
				}
				// Resend has no separate credentials call: the key is the first step of its checklist.
				const keyStep = data.view?.steps.find((step) => step.key === "key");
				setCredentials(
					provider === "resend" && keyStep
						? keyStep.ok
						: (data.credentials ?? true)
				);
				setView(data.view ?? null);
				setError(data.error ?? "");
			},
			(error_) => {
				if (active) {
					setError(
						error_ instanceof Error
							? error_.message
							: t("domains.providerUnreachable")
					);
				}
			},
			() => {
				if (active) {
					setLoading(false);
				}
			}
		);
		return () => {
			active = false;
		};
	}, [domainId, provider, reload, t]);

	useEffect(() => {
		if (!loading) {
			onReady?.(
				(() => {
					if (view) {
						return view.ready;
					}
					if (credentials === false) {
						return false;
					}
					return null;
				})()
			);
		}
	}, [loading, view, credentials, onReady]);

	const refresh = useCallback(() => {
		setLoading(true);
		setReload((value) => value + 1);
	}, []);

	function setup() {
		setBusy(true);
		setError("");
		setNotice("");
		return runAsyncAction(
			async () => {
				const done = await runReceivingSetup(domainId, provider, confirm);
				if (done) {
					setNotice(t("domains.setupFinished"));
				}
				refresh();
			},
			(error_) => {
				setError(
					error_ instanceof Error ? error_.message : t("domains.setupFailed")
				);
			},
			() => {
				setBusy(false);
			}
		);
	}

	const needsSetup = !!view && !view.ready;
	return (
		<div className="flex flex-col gap-2">
			{provider === "ses" ? (
				<AwsCredentialsPanel
					need="receiving"
					onChanged={(configured) => {
						setCredentials(configured);
						refresh();
					}}
				/>
			) : (
				<ul className="flex flex-col gap-2">
					<ResendKeyRow
						configured={credentials}
						onChanged={(configured) => {
							setCredentials(configured);
							refresh();
						}}
						onError={setError}
					/>
				</ul>
			)}
			{credentials && (
				<ul className="flex flex-col gap-2">
					{loading && !view && (
						<li className="list-none text-sm text-muted-foreground">
							{t("domains.checking")}
						</li>
					)}
					{view?.steps
						.filter((step) => provider !== "resend" || step.key !== "key")
						.map((step) => (
							<StatusRow key={step.key} ok={step.ok} title={step.label} hint="">
								{step.detail ??
									(step.ok ? t("domains.ok") : t("domains.notSetUp"))}
							</StatusRow>
						))}
				</ul>
			)}
			{credentials && view?.restrictedKey && (
				<p className="text-xs text-muted-foreground">
					{t("domains.restrictedKey", { webhook: "\u0001" })
						.split("\u0001")
						.flatMap((part, index) =>
							index === 0
								? [part]
								: [<code key={index}>email.received</code>, part]
						)}
				</p>
			)}
			{credentials && !view?.restrictedKey && (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="text-xs text-muted-foreground">
						{t(COPY[provider].hint)}
					</p>
					<span className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={busy || loading}
							onClick={refresh}
						>
							{loading ? t("domains.checking") : t("domains.checkAgain")}
						</Button>
						{needsSetup && (
							<Button
								size="sm"
								disabled={busy || loading}
								onClick={() => setup()}
							>
								{busy
									? t("domains.working")
									: t("domains.setupReceivingButton")}
							</Button>
						)}
					</span>
				</div>
			)}
			{notice && <output className="text-xs text-success">{notice}</output>}
			{error && (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}
