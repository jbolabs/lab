"use client";

import { starredFolderConfig } from "@/components/messages/message-folder-configs";
import { MessageSplitLayout } from "@/components/messages/message-split-layout";

export default function StarredLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<MessageSplitLayout config={starredFolderConfig}>
			{children}
		</MessageSplitLayout>
	);
}
