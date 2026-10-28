"use client";

import { useLanguage } from "@/components/language-provider";
import { Switch } from "@/components/ui/switch";
import { useConversationView } from "@/components/messages/use-conversation-view";
import { useLatestMessagesFirst } from "@/components/messages/use-latest-messages-first";

export function InboxThreadingSettings() {
	const { t } = useLanguage();
	const [conversationView, setConversationView] = useConversationView();
	const [latestMessagesFirst, setLatestMessagesFirst] = useLatestMessagesFirst();

	return (
		<div className="space-y-3">
			<label className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
				<span className="flex-1">
					<span className="block text-sm font-medium text-foreground">{t("settings.threading.groupTitle")}</span>
					<span className="mt-1 block text-sm text-muted-foreground">
						{t("settings.threading.groupDescription")}
					</span>
				</span>
				<Switch checked={conversationView} onCheckedChange={setConversationView} />
			</label>
			<label className="flex items-start gap-3 rounded-xl bg-muted/60 p-4">
				<span className="flex-1">
					<span className="block text-sm font-medium text-foreground">{t("settings.threading.latestTitle")}</span>
					<span className="mt-1 block text-sm text-muted-foreground">
						{t("settings.threading.latestDescription")}
					</span>
				</span>
				<Switch checked={latestMessagesFirst} onCheckedChange={setLatestMessagesFirst} />
			</label>
		</div>
	);
}
