"use client";
import { useLanguage } from "@/components/language-provider";
import { useConversationView } from "@/components/messages/use-conversation-view";
import { useLatestMessagesFirst } from "@/components/messages/use-latest-messages-first";
import {
	Field,
	FieldContent,
	FieldLabel,
	FieldDescription,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

export function InboxThreadingSettings() {
	const { t } = useLanguage();
	const [conversationView, setConversationView] = useConversationView();
	const [latestMessagesFirst, setLatestMessagesFirst] =
		useLatestMessagesFirst();
	return (
		<div className="flex flex-col gap-3">
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="inbox-threading-settings-0">
						{t("settings.threading.groupTitle")}
					</FieldLabel>
					<FieldDescription>
						{t("settings.threading.groupDescription")}
					</FieldDescription>
				</FieldContent>
				<Switch
					id="inbox-threading-settings-0"
					checked={conversationView}
					onCheckedChange={setConversationView}
					aria-label={t("settings.threading.groupTitle")}
				/>
			</Field>
			<Field orientation="horizontal">
				<FieldContent>
					<FieldLabel htmlFor="inbox-threading-settings-1">
						{t("settings.threading.latestTitle")}
					</FieldLabel>
					<FieldDescription>
						{t("settings.threading.latestDescription")}
					</FieldDescription>
				</FieldContent>
				<Switch
					id="inbox-threading-settings-1"
					checked={latestMessagesFirst}
					onCheckedChange={setLatestMessagesFirst}
					aria-label={t("settings.threading.latestTitle")}
				/>
			</Field>
		</div>
	);
}
