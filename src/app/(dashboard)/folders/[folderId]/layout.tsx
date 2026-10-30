"use client";

import { MessageSplitLayout } from "@/components/messages/message-split-layout";
import { useCustomFolderConfig } from "@/components/messages/use-custom-folder-config";
import { useParams } from "@/lib/navigation";

export default function CustomFolderLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const params = useParams<{ folderId: string }>();
	const config = useCustomFolderConfig(params.folderId);

	return <MessageSplitLayout config={config}>{children}</MessageSplitLayout>;
}
