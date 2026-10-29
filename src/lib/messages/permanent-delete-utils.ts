import type { PermanentDeleteFolder } from "@/app/api/messages/bulk/types";

import { defaultTranslator } from "../i18n/utils";
import type { Translator } from "../i18n/utils";

const folderLabelKeys = {
	spam: "navigation.spam",
	trash: "navigation.trash",
} as const;

export function getPermanentDeleteFolderLabel(
	folder: PermanentDeleteFolder,
	t: Translator = defaultTranslator
): string {
	return t(folderLabelKeys[folder]);
}

/** Whether the folder being viewed offers "Delete forever" and "Empty …". */
export function supportsPermanentDelete(
	folder: string | null | undefined
): folder is PermanentDeleteFolder {
	return folder === "trash" || folder === "spam";
}

export function getEmptyFolderLabel(
	folder: PermanentDeleteFolder,
	t: Translator = defaultTranslator
): string {
	return t("list.emptyFolder", {
		folder: getPermanentDeleteFolderLabel(folder, t),
	});
}

export function getPermanentDeleteConfirmText(
	count: number,
	t: Translator = defaultTranslator
): string {
	return t("delete.confirm", { count });
}

export function getEmptyFolderConfirmText(
	folder: PermanentDeleteFolder,
	total?: number,
	t: Translator = defaultTranslator
): string {
	const vars = {
		count: total ?? 0,
		folder: getPermanentDeleteFolderLabel(folder, t),
	};
	if (total === 1) {
		return t("empty.confirm.single", vars);
	}
	return total && total > 1
		? t("empty.confirm.multiple", vars)
		: t("empty.confirm.all", vars);
}

/** Some of the requested messages were not in Trash or Spam any more, so the server kept them. */
export class PartialDeleteError extends Error {
	override name = "PartialDeleteError";
	readonly skipped: number;
	constructor(skipped: number) {
		super("Some messages could not be deleted");
		this.skipped = skipped;
	}
}

export async function throwIfDeleteSkipped(
	response: Response,
	action: string
): Promise<void> {
	if (action !== "delete") {
		return;
	}
	const result = (await response.json().catch(() => null)) as {
		skipped?: number;
	} | null;
	if (!result?.skipped) {
		return;
	}
	window.dispatchEvent(new Event("mailflare:messages-changed"));
	throw new PartialDeleteError(result.skipped);
}
