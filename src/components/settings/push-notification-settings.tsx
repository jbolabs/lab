"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Field,
	FieldContent,
	FieldLabel,
	FieldDescription,
} from "@/components/ui/field";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
	disablePushNotifications,
	enablePushNotifications,
	getPushState,
} from "@/lib/push/client";
type State = {
	loading: boolean;
	supported: boolean;
	configured: boolean;
	permission: NotificationPermission | "unsupported";
	subscribed: boolean;
	error: string | null;
};
const initialState: State = {
	loading: true,
	supported: false,
	configured: false,
	permission: "unsupported",
	subscribed: false,
	error: null,
};
export function PushNotificationSettings() {
	const [state, setState] = useState<State>(initialState);
	useEffect(() => {
		let cancelled = false;
		getPushState()
			.then((next) => {
				if (!cancelled) setState({ ...next, loading: false, error: null });
			})
			.catch((error) => {
				if (!cancelled) {
					setState((current) => ({
						...current,
						loading: false,
						error:
							error instanceof Error
								? error.message
								: "Failed to load notification settings",
					}));
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);
	const disabled =
		state.loading ||
		!state.supported ||
		(!state.configured && !state.subscribed) ||
		(state.permission === "denied" && !state.subscribed);
	let description = "Get new mail alerts even when Lab is closed.";
	if (!state.supported)
		description = "This browser does not support Web Push for Lab.";
	else if (!state.configured)
		description = "Web Push has not been configured on this Lab server.";
	else if (state.permission === "denied")
		description = "Notifications are blocked in your browser settings.";
	return (
		<div>
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="push-notification-settings-0">Browser push notifications</FieldLabel>
					<FieldDescription>{description}</FieldDescription>
				</FieldContent>
				<Switch id="push-notification-settings-0"
					checked={state.subscribed}
					disabled={disabled}
					onCheckedChange={(enabled) => {
						setState((current) => ({ ...current, loading: true, error: null }));
						void (
							enabled ? enablePushNotifications() : disablePushNotifications()
						)
							.then(() => getPushState())
							.then((next) =>
								setState({ ...next, loading: false, error: null }),
							)
							.catch((error) => {
								setState((current) => ({
									...current,
									loading: false,
									error:
										error instanceof Error
											? error.message
											: "Failed to update notifications",
								}));
							});
					}}
					aria-label="Enable browser push notifications"
				/>
			</Field>
			{state.error && (
				<Alert variant="destructive">
					<AlertDescription>{state.error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
