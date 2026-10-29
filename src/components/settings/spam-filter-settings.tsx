"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Field,
	FieldContent,
	FieldLabel,
	FieldDescription,
} from "@/components/ui/field";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth/client";
import { useLanguage } from "@/components/language-provider";
import { Switch } from "@/components/ui/switch";
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
				if (!response.ok)
					throw new Error(data.error ?? t("settings.spam.loadFailed"));
				setEnabled(data.enabled !== false);
			})
			.catch((nextError) =>
				setError(
					nextError instanceof Error
						? nextError.message
						: t("settings.spam.loadFailed"),
				),
			)
			.finally(() => setLoading(false));
	}, []);
	async function updateEnabled(nextEnabled: boolean) {
		const previous = enabled;
		setEnabled(nextEnabled);
		setLoading(true);
		setError(null);
		try {
			const response = await authFetch("/api/settings/spam", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: nextEnabled }),
			});
			const data = (await response.json()) as {
				enabled?: boolean;
				error?: string;
			};
			if (!response.ok)
				throw new Error(data.error ?? t("settings.spam.updateFailed"));
			setEnabled(data.enabled !== false);
		} catch (nextError) {
			setEnabled(previous);
			setError(
				nextError instanceof Error
					? nextError.message
					: t("settings.spam.updateFailed"),
			);
		} finally {
			setLoading(false);
		}
	}
	return (
		<div>
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="spam-filter-settings-0">{t("settings.spam.title")}</FieldLabel>
					<FieldDescription>{t("settings.spam.description")}</FieldDescription>
				</FieldContent>
				<Switch id="spam-filter-settings-0"
					checked={enabled}
					disabled={loading}
					onCheckedChange={(value) => void updateEnabled(value)}
					aria-label={t("settings.spam.enable")}
				/>
			</Field>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
