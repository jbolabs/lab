"use client";

import { Folder } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useSelectedMailbox } from "@/components/mailbox-provider";
import { getMailboxFolders } from "@/lib/folders/client";

import type { CustomFolderSummary } from "./custom-folder-config-types";
import type { MessageFolderConfig } from "./types";

export function useCustomFolderConfig(folderId: string): MessageFolderConfig {
	const { selectedMailbox } = useSelectedMailbox();
	const [folderName, setFolderName] = useState("Folder");

	useEffect(() => {
		if (!selectedMailbox?.id) {
			return;
		}
		let cancelled = false;
		getMailboxFolders<{ folders?: CustomFolderSummary[] }>(selectedMailbox.id)
			.then((data) => {
				if (cancelled) {
					return null;
				}
				const folder = data.folders?.find((item) => item.id === folderId);
				if (folder) {
					setFolderName(folder.name);
				}

				return null;
			})
			.catch(() => {
				// Keep the current UI state when this optional background request fails.
			});

		return () => {
			cancelled = true;
		};
	}, [folderId, selectedMailbox?.id]);

	return useMemo(
		() => ({
			emptyText: "No emails in this folder",
			folder: "inbox",
			folderId,
			hrefPrefix: `/folders/${folderId}`,
			icon: Folder,
			showRowBadge: false,
			title: folderName,
		}),
		[folderId, folderName]
	);
}
