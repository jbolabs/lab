"use client";

import { snoozedFolderConfig } from "@/components/messages/message-folder-configs";
import { MessageFolderPage } from "@/components/messages/message-folder-page";

export default function SnoozedPage() {
	return <MessageFolderPage config={snoozedFolderConfig} />;
}
