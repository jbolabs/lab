import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { InboxReadingLayoutSettings } from "@/components/settings/inbox-reading-layout-settings";
import { InboxShortcutsSettings } from "@/components/settings/inbox-shortcuts-settings";
import { InboxThreadingSettings } from "@/components/settings/inbox-threading-settings";
import { MailboxAutoReplyForm } from "@/components/settings/mailbox-auto-reply-form";
import { PushNotificationSettings } from "@/components/settings/push-notification-settings";
import { RecipientAddressSettings } from "@/components/settings/recipient-address-settings";
import { RemoteContentSettings } from "@/components/settings/remote-content-settings";
import { SpamFilterSettings } from "@/components/settings/spam-filter-settings";
import { TrashRetentionSettings } from "@/components/settings/trash-retention-settings";
import {
	CardHeader,
	CardTitle,
	CardDescription,
	Card,
	CardContent,
} from "@/components/ui/card";
import {
	PageHeader,
	PageHeaderText,
	PageTitle,
} from "@/components/ui/page-header";
import { getServerTranslator } from "@/lib/i18n/server";

export default async function SettingsInboxPage() {
	const t = await getServerTranslator();
	return (
		<div className="flex flex-col gap-8 py-4">
			<PageHeader>
				<PageHeaderText>
					<PageTitle>{t("settings.nav.inbox")}</PageTitle>
				</PageHeaderText>
			</PageHeader>
			<Card>
				<CardHeader>
					<CardTitle>{t("settingsPage.inbox.experience")}</CardTitle>
					<CardDescription>
						{t("settingsPage.inbox.experienceDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="divide-y divide-border py-6">
						<Card>
							<CardHeader>
								<CardTitle>{t("settingsPage.inbox.appearance")}</CardTitle>
								<CardDescription>
									{t("settingsPage.inbox.appearanceDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<AppearanceSettings />
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>{t("settingsPage.inbox.readingLayout")}</CardTitle>
								<CardDescription>
									{t("settingsPage.inbox.readingLayoutDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<InboxReadingLayoutSettings />
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>{t("settingsPage.inbox.threading")}</CardTitle>
								<CardDescription>
									{t("settingsPage.inbox.threadingDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<InboxThreadingSettings />
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>{t("settingsPage.inbox.addresses")}</CardTitle>
								<CardDescription>
									{t("settingsPage.inbox.addressesDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<RecipientAddressSettings />
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>{t("settingsPage.inbox.shortcuts")}</CardTitle>
								<CardDescription>
									{t("settingsPage.inbox.shortcutsDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<InboxShortcutsSettings />
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>{t("settingsPage.inbox.notifications")}</CardTitle>
								<CardDescription>
									{t("settingsPage.inbox.notificationsDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<PushNotificationSettings />
							</CardContent>
						</Card>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{t("settingsPage.inbox.handling")}</CardTitle>
					<CardDescription>
						{t("settingsPage.inbox.handlingDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="divide-y divide-border py-6">
						<Card>
							<CardHeader>
								<CardTitle>{t("settingsPage.inbox.spamProtection")}</CardTitle>
								<CardDescription>
									{t("settingsPage.inbox.spamProtectionDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<SpamFilterSettings />
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>{t("settingsPage.inbox.remoteContent")}</CardTitle>
								<CardDescription>
									{t("settingsPage.inbox.remoteContentDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<RemoteContentSettings />
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>{t("settingsPage.inbox.cleanup")}</CardTitle>
								<CardDescription>
									{t("settingsPage.inbox.cleanupDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<TrashRetentionSettings />
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle>{t("settingsPage.inbox.autoReply")}</CardTitle>
								<CardDescription>
									{t("settingsPage.inbox.autoReplyDescription")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<MailboxAutoReplyForm />
							</CardContent>
						</Card>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
