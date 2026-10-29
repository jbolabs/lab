"use client";

import { useEffect, useState } from "react";

import type { TrashRetentionSettingsResponse } from "@/app/api/settings/trash-retention/types";
import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { withCleanup, requireSuccessfulResponse } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";
import {
	TRASH_RETENTION_OPTIONS,
	describeTrashRetention,
} from "@/lib/email/trash-retention-utils";

export function TrashRetentionSettings() {
	const { t } = useLanguage();
	const [days, setDays] = useState<number | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		void authFetch("/api/settings/trash-retention")
			.then(async (response) => {
				const data = (await response.json()) as TrashRetentionSettingsResponse;
				requireSuccessfulResponse(
					response,
					typeof data.error === "string"
						? data.error
						: t("settings.trash.loadFailed")
				);
				setDays(data.days ?? null);

				return null;
			})
			.catch((nextError) =>
				setError(
					nextError instanceof Error
						? nextError.message
						: t("settings.trash.loadFailed")
				)
			)
			.finally(() => setLoading(false));
	}, [t]);
	async function updateDays(nextDays: number | null) {
		const previous = days;
		setDays(nextDays);
		setLoading(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const response = await authFetch("/api/settings/trash-retention", {
						body: JSON.stringify({ days: nextDays }),
						headers: { "Content-Type": "application/json" },
						method: "PATCH",
					});
					const data =
						(await response.json()) as TrashRetentionSettingsResponse;
					requireSuccessfulResponse(
						response,
						typeof data.error === "string"
							? data.error
							: t("settings.trash.updateFailed")
					);
					setDays(data.days ?? null);
				} catch (nextError) {
					setDays(previous);
					setError(
						nextError instanceof Error
							? nextError.message
							: t("settings.trash.updateFailed")
					);
				}
			},
			() => {
				setLoading(false);
			}
		);
	}
	// Keep a custom value set through the API selectable instead of silently showing "Never".
	const options: number[] =
		days && !(TRASH_RETENTION_OPTIONS as readonly number[]).includes(days)
			? [...TRASH_RETENTION_OPTIONS, days].toSorted((a, b) => a - b)
			: [...TRASH_RETENTION_OPTIONS];
	return (
		<div className="flex flex-col gap-4">
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="trash-retention">
						{t("settings.trash.title")}
					</FieldLabel>
					<FieldDescription>{t("settings.trash.description")}</FieldDescription>
				</FieldContent>
				<NativeSelect
					id="trash-retention"
					value={days ?? ""}
					disabled={loading}
					onChange={(event) =>
						updateDays(event.target.value ? Number(event.target.value) : null)
					}
					aria-label={t("settings.trash.title")}
				>
					<option value="">{describeTrashRetention(null, t)}</option>
					{options.map((value) => (
						<option key={value} value={value}>
							{describeTrashRetention(value, t)}
						</option>
					))}
				</NativeSelect>
			</Field>
			{error && (
				<Alert variant="error">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
