import type { BulkMessageAction } from "@/app/api/messages/bulk/types";
import type { MessageCounts, MessageFolder } from "@/hooks/types";
import { authFetch } from "@/lib/auth/client";

export function getFolderNavCount(
	folder: MessageFolder,
	counts: MessageCounts["folders"]
): number | undefined {
	return counts[folder].unread;
}

async function moveMessages(payload: {
	messageIds: string[];
	action: BulkMessageAction;
	folderId?: string;
}) {
	const response = await authFetch("/api/messages/bulk", {
		body: JSON.stringify(payload),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

	if (!response.ok) {
		throw new Error("Unable to move messages");
	}
	window.dispatchEvent(new Event("mailflare:messages-changed"));
}

export function moveMessagesToSystemFolder(
	messageIds: string[],
	action: "archive" | "spam" | "trash"
) {
	return moveMessages({ action, messageIds });
}

export function moveMessagesToCustomFolder(
	messageIds: string[],
	folderId: string
) {
	return moveMessages({ action: "folder", folderId, messageIds });
}
