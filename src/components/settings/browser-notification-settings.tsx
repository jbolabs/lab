"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Field,
	FieldContent,
	FieldLabel,
	FieldDescription,
} from "@/components/ui/field";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Switch } from "@/components/ui/switch";
import {
	areBrowserNotificationsEnabled,
	setBrowserNotificationsEnabled,
} from "@/hooks/message-realtime-utils";
export function BrowserNotificationSettings() {
	const { t } = useLanguage();
	const [permission, setPermission] = useState<
		NotificationPermission | "unsupported"
	>("unsupported");
	const [enabled, setEnabled] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		const refresh = () => {
			setPermission(
				typeof Notification === "undefined"
					? "unsupported"
					: Notification.permission,
			);
			setEnabled(areBrowserNotificationsEnabled());
		};
		refresh();
		window.addEventListener("focus", refresh);
		window.addEventListener("storage", refresh);
		return () => {
			window.removeEventListener("focus", refresh);
			window.removeEventListener("storage", refresh);
		};
	}, []);
	return (
		<div>
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="browser-notification-settings-0">{t("settings.notifications.title")}</FieldLabel>
					<FieldDescription>
						{t("settings.notifications.description")}
					</FieldDescription>
				</FieldContent>
				<Switch id="browser-notification-settings-0"
					checked={permission === "granted" && enabled}
					disabled={permission === "unsupported" || permission === "denied"}
					onCheckedChange={(nextEnabled) => {
						setError(null);
						if (!nextEnabled) {
							try {
								setBrowserNotificationsEnabled(false);
								setEnabled(false);
							} catch {
								setError(t("settings.notifications.saveFailed"));
							}
							return;
						}
						void (async () => {
							try {
								const nextPermission =
									permission === "granted"
										? permission
										: await Notification.requestPermission();
								setPermission(nextPermission);
								if (nextPermission !== "granted") return;
								setBrowserNotificationsEnabled(true);
								setEnabled(true);
							} catch {
								setError(t("settings.notifications.enableFailed"));
							}
						})();
					}}
					aria-label={t("settings.notifications.enable")}
				/>
			</Field>
			{permission === "denied" && (
				<p className="mt-2 px-4 text-sm text-muted-foreground">
					{t("settings.notifications.blocked")}
				</p>
			)}
			{permission === "unsupported" && (
				<p className="mt-2 px-4 text-sm text-muted-foreground">
					{t("settings.notifications.unavailable")}
				</p>
			)}
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
