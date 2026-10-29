"use client";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import {
	FieldLabel,
	Field,
	FieldGroup,
	FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveUserTimeZonePreference } from "@/lib/time/client";

import type { TimeZoneFormProps } from "./time-zone-form-types";
import {
	formatCurrentTimeInZone,
	listTimeZones,
	updateUserTimeZone,
} from "./time-zone-form-utils";

export function TimeZoneForm({ userId, initialTimeZone }: TimeZoneFormProps) {
	const { t } = useLanguage();
	const [timeZone, setTimeZone] = useState(initialTimeZone ?? "");
	const [savedTimeZone, setSavedTimeZone] = useState(initialTimeZone ?? "");
	const [saving, setSaving] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const deviceTimeZone =
		new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	const currentZone = timeZone.trim() || deviceTimeZone;
	const validZone = (() => {
		try {
			return formatCurrentTimeInZone(currentZone);
		} catch {
			return null;
		}
	})();
	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("settings.timeZone.title")}</CardTitle>
				<CardDescription>
					{t("settings.timeZone.description", { zone: deviceTimeZone })}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						setSaving(true);
						setStatus(null);
						try {
							const saved = await updateUserTimeZone(timeZone);
							setTimeZone(saved ?? "");
							setSavedTimeZone(saved ?? "");
							saveUserTimeZonePreference(userId, saved);
							setStatus(t("common.saved"));
						} catch (error) {
							setStatus(
								error instanceof Error
									? error.message
									: t("settings.timeZone.failed")
							);
						}
						setSaving(false);
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="account-time-zone">
								{t("settings.timeZone.title")}
							</FieldLabel>
							<Input
								id="account-time-zone"
								list="account-time-zone-options"
								value={timeZone}
								onChange={(event) => {
									setTimeZone(event.target.value);
									setStatus(null);
								}}
								placeholder={t("settings.timeZone.placeholder", {
									zone: deviceTimeZone,
								})}
								autoComplete="off"
							/>
							<datalist id="account-time-zone-options">
								{listTimeZones(deviceTimeZone).map((zone) => (
									<option key={zone} value={zone}>
										{zone}
									</option>
								))}
							</datalist>
							{validZone && (
								<FieldDescription>
									{t("settings.timeZone.current", { time: validZone })}
								</FieldDescription>
							)}
						</Field>
						<div className="flex items-center gap-3">
							<Button
								type="submit"
								disabled={
									saving || timeZone.trim() === savedTimeZone || !validZone
								}
							>
								{saving ? t("common.saving") : t("settings.timeZone.save")}
							</Button>
							{status && (
								<output className="text-sm text-muted-foreground">
									{status}
								</output>
							)}
						</div>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
