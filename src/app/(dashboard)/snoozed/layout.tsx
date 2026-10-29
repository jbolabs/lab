"use client";

import { snoozedFolderConfig } from "@/components/messages/message-folder-configs";
import { MessageSplitLayout } from "@/components/messages/message-split-layout";

export default function SnoozedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<MessageSplitLayout config={snoozedFolderConfig}>
			{children}
		</MessageSplitLayout>
	);
}
