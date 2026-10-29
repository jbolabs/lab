"use client";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { runAsyncAction } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import type { ResendDomainView } from "@/lib/domains/resend-domain-types";

import { DnsValue } from "./dns-value";
import ResendKeyRow from "./resend-key-row";
import { StatusRow } from "./status-row";

interface ResendResponse {
	keyConfigured?: boolean;
	canManageDomains?: boolean;
	resend?: ResendDomainView | null;
	error?: string;
}

async function postJson<T>(
	url: string,
	method: string,
	body: unknown
): Promise<T> {
	const response = await authFetch(url, {
		body: JSON.stringify(body),
		headers: { "Content-Type": "application/json" },
		method,
	});
	const data = (await response.json()) as T & { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? "Request failed");
	}
	return data;
}

export default function ResendDomainSection({
	domainId,
	onStatus,
}: {
	domainId: string;
	onStatus?: (status: string | null) => void;
}) {
	const { t } = useLanguage();
	const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
	const [view, setView] = useState<ResendDomainView | null>(null);
	const [canManage, setCanManage] = useState(true);
	const [loading, setLoading] = useState(true);
	const [reload, setReload] = useState(0);
	const [busy, setBusy] = useState<"setup" | "verify" | "test" | null>(null);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	useEffect(() => {
		let active = true;
		runAsyncAction(
			async () => {
				const result0 = await authFetch(
					`/api/domains/${domainId}/resend?refresh=${reload}`,
					{
						cache: "no-store",
					}
				);
				const data = (await result0.json()) as ResendResponse;
				if (!active) {
					return;
				}
				if (!result0.ok && data.keyConfigured === undefined) {
					throw new Error(data.error ?? t("resend.unreachable"));
				}
				setKeyConfigured(data.keyConfigured ?? true);
				setCanManage(data.canManageDomains ?? true);
				setView(data.resend ?? null);
				setError(result0.ok ? "" : (data.error ?? ""));
			},
			(error_) => {
				if (active) {
					setKeyConfigured(true);
					setError(
						error_ instanceof Error ? error_.message : t("resend.unreachable")
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
				if (keyConfigured === false) {
					return "no_key";
				}
				if (canManage) {
					return view?.status ?? null;
				}
				return null;
			})()
		);
	}, [loading, keyConfigured, canManage, view, onStatus]);

	function run(kind: "setup" | "verify" | "test", action: () => Promise<void>) {
		setBusy(kind);
		setError("");
		setNotice("");
		return runAsyncAction(
			async () => {
				await action();
			},
			(error_) => {
				setError(
					error_ instanceof Error ? error_.message : t("domains.requestFailed")
				);
			},
			() => {
				setBusy(null);
			}
		);
	}

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
			const data = await postJson<ResendResponse>(
				`/api/domains/${domainId}/resend`,
				"POST",
				{ action }
			);
			setView(data.resend ?? null);
		});
	const sendTest = () =>
		run("test", async () => {
			const data = await postJson<{ to: string }>(
				`/api/domains/${domainId}/resend`,
				"POST",
				{ action: "test" }
			);
			setNotice(t("resend.testSent", { to: data.to }));
		});

	const verified = view?.status === "verified";
	const needsFullKey = t("resend.needsFullKey");
	const domainLabel = (() => {
		if (loading) {
			return t("resend.checking");
		}
		if (canManage) {
			if (view) {
				if (verified) {
					return t("resend.verified");
				}
				if (view.registered) {
					if (view.missingDns === 0) {
						return t("resend.waiting", {
							status: view.status.replaceAll("_", " "),
						});
					}
					if (view.missingDns) {
						return t("resend.missingDns", { count: view.missingDns });
					}
					return t("resend.dnsCheck", {
						status: view.status.replaceAll("_", " "),
					});
				}
				return t("resend.notAdded");
			}
			return t("resend.cannotRead");
		}
		return t("resend.cannotCheck");
	})();
	const domainButton = (() => {
		if (canManage) {
			if (view) {
				if (view.registered && !view.dnsManaged) {
					return t("resend.btn.verify");
				}
				if (!view.registered) {
					if (view.dnsManaged) {
						return t("resend.btn.setupDomainDns");
					}
					return t("resend.btn.setupDomain");
				}
				if (view.dnsManaged && view.missingDns !== 0) {
					return t("resend.btn.createMissing");
				}
				return t("resend.btn.checkStatus");
			}
			return null;
		}
		return t("resend.btn.setupDomain");
	})();

	const renderDomainStatus = () => (
		<StatusRow
			ok={verified}
			title={t("resend.domain")}
			hint={t("resend.domainHint")}
			action={
				<>
					{" "}
					{verified && (
						<Button
							size="sm"
							variant="outline"
							disabled={busy !== null}
							onClick={() => sendTest()}
						>
							{busy === "test" ? t("resend.sending") : t("resend.sendTest")}
						</Button>
					)}{" "}
					{!verified && domainButton && !loading && (
						<Button
							size="sm"
							variant="outline"
							disabled={!canManage || busy !== null}
							title={canManage ? undefined : needsFullKey}
							onClick={() =>
								domainAction(
									view?.registered &&
										(!view.dnsManaged || view.missingDns === 0)
										? "verify"
										: "setup"
								)
							}
						>
							{busyLabel(domainButton)}
						</Button>
					)}{" "}
				</>
			}
		>
			{domainLabel}
		</StatusRow>
	);
	return (
		<div className="flex flex-col gap-2">
			<ul className="flex flex-col gap-2">
				<ResendKeyRow
					configured={keyConfigured}
					onChanged={(configured) => {
						setKeyConfigured(configured);
						if (!configured) {
							setView(null);
						}
						setLoading(true);
						setReload((value) => value + 1);
					}}
					onError={setError}
				/>

				{keyConfigured && renderDomainStatus()}
			</ul>

			{!loading && !canManage && keyConfigured && (
				<p className="text-xs text-muted-foreground">
					{t("resend.manualHint")}
				</p>
			)}
			{view && view.registered && !verified && !view.dnsManaged && (
				<p className="text-xs text-muted-foreground">
					{t("resend.addRecords")}
				</p>
			)}
			{view &&
				view.registered &&
				!verified &&
				view.dnsManaged &&
				view.missingDns === 0 && (
					<p className="text-xs text-muted-foreground">
						{t("resend.propagate")}
					</p>
				)}

			{view && view.records.length > 0 && !verified && (
				<ul className="flex flex-col gap-1 text-xs text-muted-foreground">
					{view.records.map((record) => (
						<li
							key={`${record.type}-${record.name}-${record.value}`}
							className="grid gap-1 rounded-lg bg-card px-3 py-2 sm:grid-cols-[4rem_minmax(8rem,14rem)_minmax(0,1fr)_auto]"
						>
							<span className="font-medium">{record.type}</span>
							<span className="break-all">{record.name}</span>
							<DnsValue
								value={`${record.priority === null ? "" : `${record.priority} `}${record.value}`}
							/>
							<span className="text-muted-foreground uppercase">
								{record.status.replaceAll("_", " ")}
							</span>
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
