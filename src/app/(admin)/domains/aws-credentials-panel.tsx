"use client";
import { useEffect, useEffectEvent, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runAsyncAction } from "@/lib/async-cleanup";
import type { AwsCapabilityReport, AwsConfigStatus } from "@/lib/aws/aws-types";

import {
	AdminConfirmationProvider,
	useAdminConfirmation,
} from "../admin-confirmation-provider";
import { ApiError, requestJson } from "./api";
import { StatusRow } from "./status-row";

interface Props {
	/** Which capabilities the caller needs, so only those rows are shown. */
	need: "sending" | "receiving";
	onChanged?: (configured: boolean, report: AwsCapabilityReport | null) => void;
}

interface PanelResponse {
	status: AwsConfigStatus;
	policy: unknown;
}

const REGION_HINTS = [
	"us-east-1",
	"us-east-2",
	"us-west-2",
	"eu-west-1",
	"eu-west-2",
	"eu-central-1",
	"ap-southeast-2",
	"ap-northeast-1",
	"ca-central-1",
];

/** Whether an error body carries the capability report the panel renders. */
function isCapabilityReport(value: unknown): value is AwsCapabilityReport {
	return (
		typeof value === "object" &&
		value !== null &&
		Array.isArray((value as AwsCapabilityReport).missing)
	);
}

/**
 * AWS credentials shared by SES sending and receiving. Saving validates them
 * with AWS (identity, then a harmless call per service) and lists any permission
 * the key lacks, along with the IAM policy that grants everything.
 */
function AwsCredentialsPanelContent({ need, onChanged }: Props) {
	const { t } = useLanguage();
	const confirm = useAdminConfirmation();
	const [status, setStatus] = useState<AwsConfigStatus | null>(null);
	const [policy, setPolicy] = useState<unknown>(null);
	const [report, setReport] = useState<AwsCapabilityReport | null>(null);
	const [editing, setEditing] = useState(false);
	const [accessKeyId, setAccessKeyId] = useState("");
	const [secretAccessKey, setSecretAccessKey] = useState("");
	const [region, setRegion] = useState("us-east-1");
	const [busy, setBusy] = useState<"save" | "check" | "remove" | null>(null);
	const [error, setError] = useState("");
	/** Capabilities of credentials a save refused, kept so their IAM policy can be shown next to the message. */
	const [rejected, setRejected] = useState<AwsCapabilityReport | null>(null);

	const notifyChanged = useEffectEvent(
		(configured: boolean, capabilityReport: AwsCapabilityReport | null) =>
			onChanged?.(configured, capabilityReport)
	);
	useEffect(() => {
		let active = true;
		runAsyncAction(
			async () => {
				const data = await requestJson<PanelResponse>("/api/admin/aws", "GET");
				if (!active) {
					return;
				}
				setStatus(data.status);
				setPolicy(data.policy);
				if (data.status.region) {
					setRegion(data.status.region);
				}
				if (!data.status.configured) {
					notifyChanged(false, null);
					return;
				}
				const checked = await requestJson<{ report: AwsCapabilityReport }>(
					"/api/admin/aws",
					"POST",
					{}
				);
				if (active) {
					setReport(checked.report);
					notifyChanged(true, checked.report);
				}
			},
			(error_) => {
				if (active) {
					setError(
						error_ instanceof Error ? error_.message : t("aws.loadFailed")
					);
					setStatus(
						(current) =>
							current ?? {
								accessKeyHint: null,
								accountId: null,
								configured: false,
								region: null,
								source: null,
							}
					);
				}
			}
		);
		return () => {
			active = false;
		};
	}, [t]);

	function run(kind: "save" | "check" | "remove", action: () => Promise<void>) {
		setBusy(kind);
		setError("");
		return runAsyncAction(
			action,
			(failure) =>
				setError(
					failure instanceof Error
						? failure.message
						: t("domains.requestFailed")
				),
			() => setBusy(null)
		);
	}

	const save = () =>
		run("save", async () => {
			let data: { status: AwsConfigStatus; report: AwsCapabilityReport };
			try {
				data = await requestJson<{
					status: AwsConfigStatus;
					report: AwsCapabilityReport;
				}>("/api/admin/aws", "PUT", { accessKeyId, region, secretAccessKey });
			} catch (error_) {
				// The server refuses to save credentials that lack SES permissions, and answers with the report
				// and the policy that would fix it. Keep both so the panel can show them under the message.
				const body =
					error_ instanceof ApiError
						? (error_.data as
								| { report?: unknown; policy?: unknown }
								| undefined)
						: undefined;
				if (body && isCapabilityReport(body.report)) {
					setReport(null);
					setRejected(body.report);
					if (body.policy) {
						setPolicy(body.policy);
					}
				}
				throw error_;
			}
			setStatus(data.status);
			setReport(data.report);
			setRejected(null);
			setEditing(false);
			setSecretAccessKey("");
			setAccessKeyId("");
			onChanged?.(true, data.report);
		});
	const check = () =>
		run("check", async () => {
			const data = await requestJson<{ report: AwsCapabilityReport }>(
				"/api/admin/aws",
				"POST",
				{}
			);
			setReport(data.report);
			setRejected(null);
			onChanged?.(true, data.report);
		});
	const remove = () =>
		run("remove", async () => {
			if (!(await confirm(t("aws.removeConfirm")))) {
				return;
			}
			const data = await requestJson<{ status: AwsConfigStatus }>(
				"/api/admin/aws",
				"DELETE",
				{}
			);
			setStatus(data.status);
			setReport(null);
			setRejected(null);
			onChanged?.(false, null);
		});

	const configured = !!status?.configured;
	const showForm = status !== null && (!configured || editing);
	const fromEnvironment = status?.source === "environment";
	// A save the server refused is not configured credentials, so its report drives the missing-permission block on its own.
	const missingReport = rejected ?? (configured && !editing ? report : null);

	const renderCredentialsEditor = () => (
		<StatusRow
			ok={configured && !editing}
			title={t("aws.credentials")}
			hint={t("aws.credentialsHint")}
			action={
				configured && !editing ? (
					<>
						<Button
							size="sm"
							variant="outline"
							disabled={busy !== null}
							onClick={() => check()}
						>
							{busy === "check" ? t("domains.checking") : t("aws.recheck")}
						</Button>
						{!fromEnvironment && (
							<Button
								size="sm"
								variant="outline"
								disabled={busy !== null}
								onClick={() => {
									setEditing(true);
									setError("");
									setRejected(null);
								}}
							>
								{t("resend.replace")}
							</Button>
						)}
						{!fromEnvironment && (
							<Button
								size="sm"
								variant="outline"
								disabled={busy !== null}
								onClick={() => remove()}
							>
								{t("resend.remove")}
							</Button>
						)}
					</>
				) : undefined
			}
		>
			{(() => {
				if (showForm) {
					return (
						<form
							className="grid gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								save();
							}}
						>
							<Input
								autoComplete="off"
								aria-label={t("aws.accessKeyId")}
								placeholder={t("aws.accessKeyId")}
								value={accessKeyId}
								onChange={(event) => setAccessKeyId(event.target.value)}
								className="max-w-sm"
							/>
							<Input
								type="password"
								autoComplete="off"
								aria-label={t("aws.secretKey")}
								placeholder={t("aws.secretKey")}
								value={secretAccessKey}
								onChange={(event) => setSecretAccessKey(event.target.value)}
								className="max-w-sm"
							/>
							<Input
								list="aws-regions"
								aria-label={t("aws.region")}
								placeholder={t("aws.region")}
								value={region}
								onChange={(event) => setRegion(event.target.value)}
								className="max-w-48"
							/>
							<datalist id="aws-regions">
								{REGION_HINTS.map((hint) => (
									<option key={hint} value={hint}>
										{hint}
									</option>
								))}
							</datalist>
							<span className="flex gap-2">
								<Button
									type="submit"
									size="sm"
									disabled={
										!accessKeyId.trim() ||
										!secretAccessKey.trim() ||
										!region.trim() ||
										busy !== null
									}
								>
									{busy === "save"
										? t("aws.validating")
										: t("aws.validateSave")}
								</Button>
								{editing && (
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => {
											setEditing(false);
											setError("");
											setRejected(null);
										}}
									>
										{t("common.cancel")}
									</Button>
								)}
							</span>
						</form>
					);
				}
				if (configured) {
					return `${t("aws.keySummary", { hint: status?.accessKeyHint, region: status?.region })}${status?.accountId ? t("aws.accountSuffix", { id: status.accountId }) : ""}${fromEnvironment ? t("aws.envSuffix") : ""}`;
				}
				return t("domains.checking");
			})()}
		</StatusRow>
	);
	const showCapability = (capability: Props["need"]) =>
		configured && !editing && need === capability;

	const renderCapabilityDetails = () => (
		<div className="flex flex-col gap-2">
			<ul className="flex flex-col gap-2">
				{renderCredentialsEditor()}

				{report && showCapability("sending") && (
					<StatusRow
						ok={report.sending}
						title={t("aws.sesSending")}
						hint={t("aws.sesSendingHint")}
					>
						{report.sending
							? t("aws.allowedIn", { region: report.region })
							: t("aws.missingSes")}
					</StatusRow>
				)}
				{report?.sending &&
					report.productionAccess === false &&
					showCapability("sending") && (
						<StatusRow
							ok={false}
							title={t("aws.sandbox")}
							hint={t("aws.sandboxHint")}
						>
							{t("aws.sandboxDetail")}
						</StatusRow>
					)}
				{report && showCapability("receiving") && (
					<>
						<StatusRow
							ok={report.receivingRegion && report.receiving}
							title={t("aws.sesReceiving")}
							hint={t("aws.sesReceivingHint")}
						>
							{(() => {
								if (report.receivingRegion) {
									if (report.receiving) {
										return t("aws.allowedIn", { region: report.region });
									}
									return t("aws.missingReceipt");
								}
								return t("aws.regionCannotReceive", { region: report.region });
							})()}
						</StatusRow>
						<StatusRow ok={report.s3} title="S3" hint={t("aws.s3Hint")}>
							{report.s3 ? t("aws.allowed") : t("aws.missingS3")}
						</StatusRow>
						<StatusRow ok={report.sns} title="SNS" hint={t("aws.snsHint")}>
							{report.sns ? t("aws.allowed") : t("aws.missingSns")}
						</StatusRow>
					</>
				)}
			</ul>
			{error && (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			)}
			{missingReport && missingReport.missing.length > 0 && (
				<details
					open={rejected !== null}
					className="rounded-lg bg-card px-3 py-2 text-xs text-muted-foreground"
				>
					<summary className="cursor-pointer font-medium text-foreground">
						{t("aws.missingSummary")}
					</summary>
					<p className="mt-2">
						{t("aws.missingList", { list: missingReport.missing.join(", ") })}
					</p>
					<pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/60 p-2">
						{JSON.stringify(policy, null, 2)}
					</pre>
				</details>
			)}
			{showForm && (
				<p className="text-xs text-muted-foreground">
					{t("aws.createUserHint")}
				</p>
			)}
		</div>
	);
	return renderCapabilityDetails();
}

export default function AwsCredentialsPanel(props: Props) {
	return (
		<AdminConfirmationProvider>
			<AwsCredentialsPanelContent {...props} />
		</AdminConfirmationProvider>
	);
}
