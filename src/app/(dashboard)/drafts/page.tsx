"use client";

import { FileText } from "lucide-react";

import { MessageFolderPage } from "@/components/messages/message-folder-page";

export default function DraftsPage() {
	return (
		<MessageFolderPage
			config={{
				badgeVariant: "outline",
				emptyText: "No drafts",
				emptyTextKey: "folder.drafts.empty",
				folder: "drafts",
				hrefPrefix: "/drafts",
				icon: FileText,
				title: "Drafts",
				titleKey: "navigation.drafts",
			}}
		/>
	);
}
