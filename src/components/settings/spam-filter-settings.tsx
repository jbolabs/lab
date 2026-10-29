"use client";

import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Field,
	FieldContent,
	FieldLabel,
	FieldDescription,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { withCleanup, requireSuccessfulResponse } from "@/lib/async-cleanup";
import { authFetch } from "@/lib/auth/client";

export function SpamFilterSettings() {
	const { t } = useLanguage();
	const [enabled, setEnabled] = useState(true);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		void authFetch("/api/settings/spam")
			.then(async (response) => {
				const data = (await response.json()) as {
					enabled?: boolean;
					error?: string;
				};
				requireSuccessfulResponse(
					response,
					data.error ?? t("settings.spam.loadFailed")
				);
				setEnabled(data.enabled !== false);

				return null;
			})
			.catch((nextError) =>
				setError(
					nextError instanceof Error
						? nextError.message
						: t("settings.spam.loadFailed")
				)
			)
			.finally(() => setLoading(false));
	}, [t]);
	async function updateEnabled(nextEnabled: boolean) {
		const previous = enabled;
		setEnabled(nextEnabled);
		setLoading(true);
		setError(null);
		return await withCleanup(
			async () => {
				try {
					const response = await authFetch("/api/settings/spam", {
						body: JSON.stringify({ enabled: nextEnabled }),
						headers: { "Content-Type": "application/json" },
						method: "PATCH",
					});
					const data = (await response.json()) as {
						enabled?: boolean;
						error?: string;
					};
					requireSuccessfulResponse(
						response,
						data.error ?? t("settings.spam.updateFailed")
					);
					setEnabled(data.enabled !== false);
				} catch (nextError) {
					setEnabled(previous);
					setError(
						nextError instanceof Error
							? nextError.message
							: t("settings.spam.updateFailed")
					);
				}
			},
			() => {
				setLoading(false);
			}
		);
	}
	return (
		<div className="flex flex-col gap-3">
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="spam-filter-settings-0">
						{t("settings.spam.title")}
					</FieldLabel>
					<FieldDescription>{t("settings.spam.description")}</FieldDescription>
				</FieldContent>
				<Switch
					id="spam-filter-settings-0"
					checked={enabled}
					disabled={loading}
					onCheckedChange={(value) => updateEnabled(value)}
					aria-label={t("settings.spam.enable")}
				/>
			</Field>
			{error && (
				<Alert variant="error">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
