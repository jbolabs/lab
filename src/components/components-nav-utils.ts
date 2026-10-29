import type { MessageFolder } from "@/hooks/types";
import { getMessageQueryParams, fetchMessageList } from "@/hooks/utils";

export async function preloadMailboxPage(href: string, mailboxId?: string) {
	const customFolderMatch = href.match(/^\/folders\/(?<folderId>[^/]+)$/u);
	const folder = (customFolderMatch ? "inbox" : href.slice(1)) as MessageFolder;
	const supportedFolders: MessageFolder[] = [
		"inbox",
		"starred",
		"snoozed",
		"sent",
		"scheduled",
		"drafts",
		"archived",
		"spam",
		"trash",
	];
	if (!supportedFolders.includes(folder)) {
		return;
	}

	const params = getMessageQueryParams(
		folder,
		mailboxId,
		{ limit: 25, offset: 0 },
		customFolderMatch?.groups?.folderId
	);
	await fetchMessageList(params);
}

export function waitForNavigationProgress(duration = 350) {
	// oxlint-disable-next-line promise/avoid-new -- Navigation progress uses a browser timer, which has no Promise API.
	return new Promise<void>((resolve) => {
		window.setTimeout(resolve, duration);
	});
}
