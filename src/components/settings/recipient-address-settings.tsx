"use client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Field,
	FieldContent,
	FieldLabel,
	FieldDescription,
} from "@/components/ui/field";
import { useState } from "react";
import { useShowFullRecipientAddresses } from "@/components/messages/use-show-full-recipient-addresses";
import { useLanguage } from "@/components/language-provider";
import { Switch } from "@/components/ui/switch";
export function RecipientAddressSettings() {
	const { t } = useLanguage();
	const { enabled, error, isLoading, setEnabled } =
		useShowFullRecipientAddresses();
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	return (
		<div>
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="recipient-address-settings-0">{t("settings.recipient.title")}</FieldLabel>
					<FieldDescription>
						{t("settings.recipient.description")}
					</FieldDescription>
				</FieldContent>
				<Switch id="recipient-address-settings-0"
					checked={enabled}
					disabled={isLoading || saving}
					onCheckedChange={(next) => {
						setSaving(true);
						setSaveError(null);
						void setEnabled(next)
							.catch((updateError) =>
								setSaveError(
									updateError instanceof Error
										? updateError.message
										: t("settings.recipient.failed"),
								),
							)
							.finally(() => setSaving(false));
					}}
					aria-label={t("settings.recipient.title")}
				/>
			</Field>
			{(saveError || error) && (
				<Alert variant="destructive">
					<AlertDescription>{saveError || error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
