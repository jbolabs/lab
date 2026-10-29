"use client";

import { starredFolderConfig } from "@/components/messages/message-folder-configs";
import { MessageFolderPage } from "@/components/messages/message-folder-page";

export default function StarredPage() {
	return <MessageFolderPage config={starredFolderConfig} />;
}
