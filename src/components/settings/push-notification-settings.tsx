"use client";

import { useEffect, useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { AUTH_SESSION_CHANGED_EVENT } from "@/lib/auth/client";
import {
	disablePushNotifications,
	enablePushNotifications,
	getPushState,
	PUSH_STATE_CHANGED_EVENT,
} from "@/lib/push/client";
import type { PushState } from "@/lib/push/client";

export function PushNotificationSettings() {
	const { t } = useLanguage();
	const [state, setState] = useState<PushState | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [retry, setRetry] = useState(0);
	useEffect(() => {
		let cancelled = false;
		let revision = retry;
		const refresh = async () => {
			revision += 1;
			const current = revision;
			try {
				const next = await getPushState();
				if (!cancelled && current === revision) {
					setState(next);
					setError(null);
				}
			} catch {
				if (!cancelled && current === revision) {
					setError(t("settings.push.loadFailed"));
				}
			}
		};
		const resume = () => {
			if (document.visibilityState === "visible") {
				refresh();
			}
		};
		refresh();
		window.addEventListener(PUSH_STATE_CHANGED_EVENT, refresh);
		window.addEventListener(AUTH_SESSION_CHANGED_EVENT, refresh);
		window.addEventListener("online", refresh);
		document.addEventListener("visibilitychange", resume);
		return () => {
			cancelled = true;
			window.removeEventListener(PUSH_STATE_CHANGED_EVENT, refresh);
			window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, refresh);
			window.removeEventListener("online", refresh);
			document.removeEventListener("visibilitychange", resume);
		};
	}, [retry, t]);

	let description = t("settings.push.description");
	if (!state) {
		description = t(
			error ? "settings.push.loadFailed" : "settings.push.loading"
		);
	} else if (state.needsInstall) {
		description = t("settings.push.install");
	} else if (!state.supported) {
		description = t("settings.push.unsupported");
	} else if (state.permission === "denied") {
		description = t("settings.push.blocked");
	} else if (!state.configured) {
		description = t("settings.push.unconfigured");
	}

	return (
		<div>
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="new-email-notifications">
						{t("settings.push.title")}
					</FieldLabel>
					<FieldDescription id="new-email-notifications-description">
						{description}
					</FieldDescription>
				</FieldContent>
				<Switch
					id="new-email-notifications"
					aria-describedby="new-email-notifications-description"
					checked={state?.subscribed ?? false}
					disabled={
						busy ||
						!state ||
						!state.supported ||
						(!state.configured && !state.subscribed) ||
						(state.permission === "denied" && !state.subscribed)
					}
					onCheckedChange={(enabled) => {
						setBusy(true);
						setError(null);
						// Calling directly keeps iOS permission attached to this tap.
						void (
							enabled ? enablePushNotifications() : disablePushNotifications()
						)
							.then(() => getPushState())
							.then(setState)
							.catch(async () => {
								try {
									setState(await getPushState());
								} catch {
									/* Keep the last known state while offline. */
								}
								setError(t("settings.push.updateFailed"));
							})
							.finally(() => setBusy(false));
					}}
				/>
			</Field>
			{error && (
				<Alert variant="destructive" className="mt-3">
					<AlertDescription>
						{error}
						<Button
							variant="link"
							size="sm"
							disabled={busy}
							onClick={() => setRetry((value) => value + 1)}
						>
							{t("settings.push.retry")}
						</Button>
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
