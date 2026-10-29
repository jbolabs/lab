import type { AttachmentContent } from "@/lib/email/attachment-types";
import { readFormDataBody, readJsonBody } from "@/lib/http/request";

import type { SendRequestPayload } from "./types";

const MAX_SEND_REQUEST_SIZE = 30 * 1024 * 1024;

function getOptionalFormValue(form: FormData, key: string): string | undefined {
	const value = form.get(key);
	return typeof value === "string" && value ? value : undefined;
}

export function isPastSchedule(
	value: string | undefined,
	now = Date.now()
): boolean {
	if (!value) {
		return false;
	}
	const time = new Date(value).getTime();
	return !Number.isFinite(time) || time < now - 60_000;
}

export async function parseSendRequest(
	request: Request
): Promise<SendRequestPayload> {
	if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
		return readJsonBody<SendRequestPayload>(request, MAX_SEND_REQUEST_SIZE);
	}

	const form = await readFormDataBody(request, MAX_SEND_REQUEST_SIZE);
	const files = form
		.getAll("attachments")
		.filter((value): value is File => value instanceof File && value.size > 0);
	const attachments: AttachmentContent[] = await Promise.all(
		files.map(async (value) => ({
			content: await value.arrayBuffer(),
			disposition: "attachment" as const,
			filename: value.name,
			type: value.type || "application/octet-stream",
		}))
	);

	return {
		attachments,
		bcc: getOptionalFormValue(form, "bcc"),
		cc: getOptionalFormValue(form, "cc"),
		draftId: getOptionalFormValue(form, "draftId"),
		from: String(form.get("from") ?? ""),
		html: getOptionalFormValue(form, "html"),
		inReplyTo: getOptionalFormValue(form, "inReplyTo"),
		mailboxId: getOptionalFormValue(form, "mailboxId"),
		references: getOptionalFormValue(form, "references"),
		scheduledAt: getOptionalFormValue(form, "scheduledAt"),
		subject: String(form.get("subject") ?? ""),
		text: getOptionalFormValue(form, "text"),
		threadId: getOptionalFormValue(form, "threadId"),
		to: String(form.get("to") ?? ""),
		undoSend: form.get("undoSend") === "true",
	};
}
