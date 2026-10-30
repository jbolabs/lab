"use client";

import { MessageFolderPage } from "@/components/messages/message-folder-page";
import { useCustomFolderConfig } from "@/components/messages/use-custom-folder-config";
import { useParams } from "@/lib/navigation";

export default function CustomFolderPage() {
	const params = useParams<{ folderId: string }>();
	const config = useCustomFolderConfig(params.folderId);

	return <MessageFolderPage config={config} />;
}
