"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Field, FieldLabel } from "@/components/ui/field";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import {
	loadRemoteContentPolicy,
	updateRemoteContentMode,
	type RemoteContentMode,
} from "@/components/messages/use-remote-content-utils";
const OPTIONS = [
	{ mode: "ask", title: "settings.remoteContent.ask" },
	{ mode: "new_sender", title: "settings.remoteContent.newSender" },
	{ mode: "allow", title: "settings.remoteContent.allow" },
] as const;
export function RemoteContentSettings() {
	const { t } = useLanguage();
	const [mode, setMode] = useState<RemoteContentMode>("allow");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		loadRemoteContentPolicy()
			.then((policy) => {
				if (!cancelled) setMode(policy.mode);
			})
			.catch((loadError) => {
				if (!cancelled)
					setError(
						loadError instanceof Error
							? loadError.message
							: t("settings.remoteContent.failed"),
					);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	const choose = (next: RemoteContentMode) => {
		const previous = mode;
		setMode(next);
		setSaving(true);
		setError(null);
		updateRemoteContentMode(next)
			.then(setMode)
			.catch((updateError) => {
				setMode(previous);
				setError(
					updateError instanceof Error
						? updateError.message
						: t("settings.remoteContent.failed"),
				);
			})
			.finally(() => setSaving(false));
	};
	return (
		<div className="flex flex-col gap-3">
			<RadioGroup
				value={mode}
				disabled={loading || saving}
				onValueChange={(next) => choose(next as RemoteContentMode)}
				aria-label={t("settingsPage.inbox.remoteContent")}
			>
				{OPTIONS.map((option) => (
					<Field
						key={option.mode}
						orientation="horizontal"
						className="min-h-11"
					>
						<RadioGroupItem id={`remote-${option.mode}`} value={option.mode} />
						<FieldLabel htmlFor={`remote-${option.mode}`}>
							{t(option.title)}
						</FieldLabel>
					</Field>
				))}
			</RadioGroup>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
