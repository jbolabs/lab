import { getAuthHeaders } from "@/lib/auth/client";
import { defaultTranslator } from "@/lib/i18n/utils";
import type { Translator } from "@/lib/i18n/utils";

import type {
	ImportMessagesResult,
	ImportProgressHandler,
} from "./import-messages-types";

export function importMessageFiles(
	mailboxId: string,
	files: File[],
	destination: string,
	onProgress?: ImportProgressHandler
): Promise<ImportMessagesResult> {
	const form = new FormData();
	form.set("mailboxId", mailboxId);
	form.set("destination", destination);
	for (const file of files) {
		form.append("files", file);
	}

	// oxlint-disable-next-line promise/avoid-new -- XMLHttpRequest upload progress is event based and requires a Promise adapter.
	return new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("POST", "/api/import/messages");
		for (const [key, value] of getAuthHeaders()) {
			request.setRequestHeader(key, value);
		}
		request.upload.addEventListener("progress", (event) => {
			if (event.lengthComputable) {
				onProgress?.(Math.round((event.loaded / event.total) * 70));
			}
		});
		request.addEventListener("error", () =>
			reject(new Error("Import upload failed"))
		);
		request.addEventListener("load", () => {
			const data = JSON.parse(
				request.responseText || "{}"
			) as ImportMessagesResult;
			if (request.status < 200 || request.status >= 300) {
				reject(new Error(data.error ?? "Import failed"));
				return;
			}
			onProgress?.(100);
			resolve(data);
		});
		request.send(form);
	});
}

export function getImportSummary(
	result: ImportMessagesResult | null,
	t: Translator = defaultTranslator
): string {
	if (!result) {
		return "";
	}
	return t("import.summary", {
		imported: result.imported ?? 0,
		skipped: result.skipped ?? 0,
	});
}
