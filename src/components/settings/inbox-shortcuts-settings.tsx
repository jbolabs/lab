"use client";
import { useState } from "react";

import { useLanguage } from "@/components/language-provider";
import { useShortcuts } from "@/components/shortcuts/shortcuts-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Field,
	FieldContent,
	FieldLabel,
	FieldDescription,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export function InboxShortcutsSettings() {
	const { t } = useLanguage();
	const {
		shortcutsEnabled,
		shortcutsPreferenceLoading,
		shortcutsPreferenceError,
		setShortcutsEnabled,
	} = useShortcuts();
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	return (
		<div className="flex flex-col gap-3">
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="inbox-shortcuts-settings-0">
						{t("settings.shortcuts.title")}
					</FieldLabel>
					<FieldDescription>
						{t("settings.shortcuts.description")}
					</FieldDescription>
				</FieldContent>
				<Switch
					id="inbox-shortcuts-settings-0"
					checked={shortcutsEnabled}
					disabled={shortcutsPreferenceLoading || saving}
					onCheckedChange={async (enabled) => {
						setSaving(true);
						setSaveError(null);
						try {
							await setShortcutsEnabled(enabled);
						} catch (error) {
							setSaveError(
								error instanceof Error
									? error.message
									: t("settings.shortcuts.failed")
							);
						}
						setSaving(false);
					}}
					aria-label={t("settings.shortcuts.enable")}
				/>
			</Field>
			{(saveError || shortcutsPreferenceError) && (
				<Alert variant="error">
					<AlertDescription>
						{saveError || shortcutsPreferenceError}
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
