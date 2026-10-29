"use client";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
	PageDescription,
} from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { runAsyncAction } from "@/lib/async-cleanup";

import { loadGeneralSettings, saveGeneralSettings } from "./utils";

export default function GeneralSettingsPage() {
	const { t } = useLanguage();
	const [maxMb, setMaxMb] = useState(25);
	const [loaded, setLoaded] = useState(false);
	const [saving, setSaving] = useState(false);
	const [status, setStatus] = useState("");
	const [unlimited, setUnlimited] = useState(true);
	const [limitGb, setLimitGb] = useState(10);
	const [driveSaving, setDriveSaving] = useState(false);
	const [driveStatus, setDriveStatus] = useState("");

	useEffect(() => {
		let active = true;
		runAsyncAction(
			async () => {
				const settings = await loadGeneralSettings();
				if (active) {
					setMaxMb(settings.outboundAttachmentMaxMb);
					setUnlimited(settings.driveStorageLimitGb === null);
					if (settings.driveStorageLimitGb !== null) {
						setLimitGb(settings.driveStorageLimitGb);
					}
					setLoaded(true);
				}
			},
			(failure) => {
				if (active) {
					setStatus(
						failure instanceof Error ? failure.message : t("general.loadFailed")
					);
				}
			}
		);
		return () => {
			active = false;
		};
	}, [t]);

	function save(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setStatus("");
		return runAsyncAction(
			async () => {
				const settings = await saveGeneralSettings({
					outboundAttachmentMaxMb: maxMb,
				});
				setMaxMb(settings.outboundAttachmentMaxMb);
				setStatus(t("general.saved"));
			},
			(failure) => {
				setStatus(
					failure instanceof Error ? failure.message : t("general.saveFailed")
				);
			},
			() => {
				setSaving(false);
			}
		);
	}

	function saveDrive(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setDriveSaving(true);
		setDriveStatus("");
		return runAsyncAction(
			async () => {
				const settings = await saveGeneralSettings({
					driveStorageLimitGb: unlimited ? null : limitGb,
				});
				setUnlimited(settings.driveStorageLimitGb === null);
				if (settings.driveStorageLimitGb !== null) {
					setLimitGb(settings.driveStorageLimitGb);
				}
				setDriveStatus(t("general.driveSaved"));
			},
			(failure) => {
				setDriveStatus(
					failure instanceof Error ? failure.message : t("general.saveFailed")
				);
			},
			() => {
				setDriveSaving(false);
			}
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("general.title")}</PageTitle>
					<PageDescription>{t("general.description")}</PageDescription>
				</PageHeaderText>
			</PageHeader>
			<Card>
				<CardHeader>
					<CardTitle>{t("general.attachments")}</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={save}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="attachment-limit">
									{t("general.maxAttachments")}
								</FieldLabel>
								<Input
									id="attachment-limit"
									type="number"
									min="1"
									max="25"
									step="1"
									value={maxMb}
									onChange={(event) => setMaxMb(Number(event.target.value))}
									disabled={!loaded || saving}
									className="max-w-40"
									required
								/>
								<FieldDescription>{t("general.appliesTo")}</FieldDescription>
							</Field>
							<Alert variant="muted">
								<AlertDescription>
									<p>{t("general.cloudflareLimit")}</p>
									<p>{t("general.largeFiles")}</p>
								</AlertDescription>
							</Alert>
							{status && (
								<output className="text-sm text-foreground/80">{status}</output>
							)}
							<Button
								type="submit"
								disabled={
									!loaded ||
									saving ||
									!Number.isInteger(maxMb) ||
									maxMb < 1 ||
									maxMb > 25
								}
							>
								{saving ? t("common.saving") : t("general.save")}
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{t("general.drive")}</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={saveDrive}>
						<FieldGroup>
							<Field orientation="horizontal">
								<Switch
									id="drive-unlimited"
									checked={unlimited}
									onCheckedChange={setUnlimited}
									disabled={!loaded || driveSaving}
								/>
								<FieldLabel htmlFor="drive-unlimited">
									{t("general.driveUnlimited")}
								</FieldLabel>
							</Field>
							{!unlimited && (
								<Field>
									<FieldLabel htmlFor="drive-limit">
										{t("general.driveLimit")}
									</FieldLabel>
									<Input
										id="drive-limit"
										type="number"
										min="0.01"
										max="1000000"
										step="any"
										value={limitGb}
										onChange={(event) => setLimitGb(Number(event.target.value))}
										disabled={!loaded || driveSaving}
										className="max-w-40"
										required
									/>
								</Field>
							)}
							<FieldDescription>{t("general.driveHint")}</FieldDescription>
							{driveStatus && (
								<output className="text-sm text-foreground/80">
									{driveStatus}
								</output>
							)}
							<Button
								type="submit"
								disabled={
									!loaded || driveSaving || (!unlimited && !(limitGb > 0))
								}
							>
								{driveSaving ? t("common.saving") : t("general.save")}
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
