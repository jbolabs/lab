"use client";
import { useLanguage } from "@/components/language-provider";
import { useTwoColumnReading } from "@/components/messages/use-two-column-reading";
import {
	Field,
	FieldContent,
	FieldLabel,
	FieldDescription,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export function InboxReadingLayoutSettings() {
	const { t } = useLanguage();
	const [twoColumnReading, setTwoColumnReading] = useTwoColumnReading();
	return (
		<Field orientation="horizontal">
			<FieldContent>
				<FieldLabel htmlFor="inbox-reading-layout-settings-0">
					{t("settings.reading.title")}
				</FieldLabel>
				<FieldDescription>{t("settings.reading.description")}</FieldDescription>
			</FieldContent>
			<Switch
				id="inbox-reading-layout-settings-0"
				checked={twoColumnReading}
				onCheckedChange={setTwoColumnReading}
				aria-label={t("settings.reading.title")}
			/>
		</Field>
	);
}
