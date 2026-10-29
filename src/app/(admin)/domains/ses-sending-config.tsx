"use client";
import { useCallback, useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { runAsyncAction } from "@/lib/async-cleanup";
import type { SesSendingView } from "@/lib/aws/ses-sending-types";

import { requestJson } from "./api";
import AwsCredentialsPanel from "./aws-credentials-panel";
import { StatusRow } from "./status-row";

interface SesResponse {
	credentials?: boolean;
	ses?: SesSendingView | null;
	error?: string;
}

export default function SesSendingConfig({
	domainId,
	onStatus,
}: {
	domainId: string;
	onStatus?: (status: string | null) => void;
}) {
	const { t } = useLanguage();
	const [credentials, setCredentials] = useState<boolean | null>(null);
	const [view, setView] = useState<SesSendingView | null>(null);
	const [loading, setLoading] = useState(true);
	const [reload, setReload] = useState(0);
	const [busy, setBusy] = useState<"setup" | "verify" | "test" | null>(null);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	useEffect(() => {
		let active = true;
		runAsyncAction(
			async () => {
				const data = await requestJson<SesResponse>(
					`/api/domains/${domainId}/ses?refresh=${reload}`,
					"GET"
				);
				if (active) {
					setCredentials(data.credentials ?? true);
					setView(data.ses ?? null);
					setError(data.error ?? "");
				}
			},
			(error_) => {
				if (active) {
					setError(
						error_ instanceof Error ? error_.message : t("ses.unreachable")
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
	}, [domainId, reload, t]);

	useEffect(() => {
		if (loading) {
			return;
		}
		onStatus?.(
			(() => {
				if (credentials === false) {
					return "no_credentials";
				}
				if (view) {
					if (view.verified) {
						return "verified";
					}
					if (view.registered) {
						return "pending";
					}
					return "not_registered";
				}
				return null;
			})()
		);
	}, [loading, credentials, view, onStatus]);

	const run = useCallback(
		(kind: "setup" | "verify" | "test", action: () => Promise<void>) => {
			setBusy(kind);
			setError("");
			setNotice("");
			return runAsyncAction(
				async () => {
					await action();
				},
				(error_) => {
					setError(
						error_ instanceof Error
							? error_.message
							: t("domains.requestFailed")
					);
				},
				() => {
					setBusy(null);
				}
			);
		},
		[t]
	);

	function busyLabel(fallback: string | null) {
		if (busy === "verify") {
			return t("domains.checking");
		}
		if (busy === "setup") {
			return t("domains.working");
		}
		return fallback;
	}

	const domainAction = (action: "setup" | "verify") =>
		run(action, async () => {
			const data = await requestJson<SesResponse>(
				`/api/domains/${domainId}/ses`,
				"POST",
				{ action }
			);
			setView(data.ses ?? null);
		});
	const sendTest = () =>
		run("test", async () => {
			const data = await requestJson<{ to: string }>(
				`/api/domains/${domainId}/ses`,
				"POST",
				{ action: "test" }
			);
			setNotice(t("resend.testSent", { to: data.to }));
		});

	const onCredentials = useCallback((configured: boolean) => {
		setCredentials(configured);
		setLoading(true);
		setReload((value) => value + 1);
	}, []);

	const label = (() => {
		if (loading) {
			return t("ses.checking");
		}
		if (view) {
			if (view.verified) {
				return t("ses.verified");
			}
			if (view.registered) {
				if (view.missingDns === 0) {
					return t("ses.waiting", { status: view.dkimStatus.toLowerCase() });
				}
				if (view.missingDns) {
					return t("ses.missingDkim", { count: view.missingDns });
				}
				return t("ses.dkim", { status: view.dkimStatus.toLowerCase() });
			}
			return t("ses.notAdded");
		}
		return t("ses.cannotRead");
	})();
	const buttonLabel = (() => {
		if (view) {
			if (view.registered) {
				if (view.dnsManaged && view.missingDns !== 0) {
					return t("resend.btn.createMissing");
				}
				return t("resend.btn.checkStatus");
			}
			if (view.dnsManaged) {
				return t("resend.btn.setupDomainDns");
			}
			return t("resend.btn.setupDomain");
		}
		return null;
	})();

	const renderDomainStatus = () => (
		<StatusRow
			ok={!!view?.verified}
			title={t("resend.domain")}
			hint={t("ses.domainHint")}
			action={
				<>
					{" "}
					{view?.verified && (
						<Button
							size="sm"
							variant="outline"
							disabled={busy !== null}
							onClick={() => sendTest()}
						>
							{busy === "test" ? t("resend.sending") : t("resend.sendTest")}
						</Button>
					)}{" "}
					{!view?.verified && buttonLabel && !loading && (
						<Button
							size="sm"
							variant="outline"
							disabled={busy !== null}
							onClick={() =>
								domainAction(
									view?.registered &&
										(!view.dnsManaged || view.missingDns === 0)
										? "verify"
										: "setup"
								)
							}
						>
							{busyLabel(buttonLabel)}
						</Button>
					)}{" "}
				</>
			}
		>
			{label}
		</StatusRow>
	);
	return (
		<div className="flex flex-col gap-2">
			<AwsCredentialsPanel need="sending" onChanged={onCredentials} />
			{credentials && (
				<ul className="flex flex-col gap-2">
					{renderDomainStatus()}
					{view?.productionAccess === false && (
						<StatusRow
							ok={false}
							title={t("aws.sandbox")}
							hint={t("ses.sandboxHint")}
						>
							{t("ses.sandboxDetail")}
						</StatusRow>
					)}
				</ul>
			)}
			{view && view.registered && !view.verified && !view.dnsManaged && (
				<p className="text-xs text-muted-foreground">{t("ses.addCnames")}</p>
			)}
			{view &&
				view.registered &&
				!view.verified &&
				view.dnsManaged &&
				view.missingDns === 0 && (
					<p className="text-xs text-muted-foreground">
						{t("resend.propagate")}
					</p>
				)}
			{view && view.registered && !view.verified && view.records.length > 0 && (
				<ul className="flex flex-col gap-1 text-xs text-muted-foreground">
					{view.records.map((record) => (
						<li
							key={record.name}
							className="grid gap-1 rounded-lg bg-card px-3 py-2 sm:grid-cols-[4rem_minmax(8rem,18rem)_minmax(0,1fr)]"
						>
							<span className="font-medium">{record.type}</span>
							<span className="break-all">{record.name}</span>
							<span className="break-all">{record.value}</span>
						</li>
					))}
				</ul>
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
