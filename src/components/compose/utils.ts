import { authFetch } from "@/lib/auth/client";

import type {
	ComposeAttachment,
	ComposeDraft,
	ComposeThreading,
	DraftResponse,
} from "./types";

export function draftThreading(threading: ComposeThreading | null) {
	return {
		inReplyTo: threading?.inReplyTo ?? null,
		references: threading?.references ?? null,
		threadId: threading?.threadId ?? null,
	};
}

export async function fetchDraft(draftId: string): Promise<ComposeDraft> {
	const res = await authFetch(`/api/drafts/${draftId}`);
	const json = (await res.json()) as DraftResponse;

	if (!res.ok || !json.draft) {
		throw new Error(json.error ?? "Failed to load draft");
	}

	return json.draft;
}

export function buildSendFormData(input: {
	attachments: ComposeAttachment[];
	from: string;
	mailboxId?: string;
	subject: string;
	text: string;
	html?: string;
	to: string;
	cc?: string;
	bcc?: string;
	threading?: ComposeThreading;
	/** Draft whose stored attachments should be sent with the message. */
	draftId?: string | null;
	scheduledAt?: Date | null;
	/** Hold the send briefly so it can be cancelled. */
	undoSend?: boolean;
}): FormData {
	const form = new FormData();
	form.set("from", input.from);
	form.set("to", input.to);
	if (input.cc) {
		form.set("cc", input.cc);
	}
	if (input.bcc) {
		form.set("bcc", input.bcc);
	}
	form.set("subject", input.subject);
	form.set("text", input.text);
	if (input.html) {
		form.set("html", input.html);
	}
	if (input.mailboxId) {
		form.set("mailboxId", input.mailboxId);
	}
	if (input.threading?.inReplyTo) {
		form.set("inReplyTo", input.threading.inReplyTo);
	}
	if (input.threading?.references) {
		form.set("references", input.threading.references);
	}
	if (input.threading?.threadId) {
		form.set("threadId", input.threading.threadId);
	}
	if (input.draftId) {
		form.set("draftId", input.draftId);
	}
	if (input.scheduledAt) {
		form.set("scheduledAt", input.scheduledAt.toISOString());
	} else if (input.undoSend) {
		form.set("undoSend", "true");
	}
	for (const attachment of input.attachments) {
		form.append("attachments", attachment.file);
	}
	return form;
}

export function formatAttachmentSize(size: number): string {
	if (size < 1024) {
		return `${size} B`;
	}
	if (size < 1024 * 1024) {
		return `${Math.ceil(size / 1024)} KB`;
	}
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSignatureBlock(signature: string | null | undefined): string {
	const value = signature?.trim() ?? "";
	return value ? `\n\n${value}` : "";
}

export function applyMailboxSignature(
	text: string,
	previousSignature: string | null | undefined,
	nextSignature: string | null | undefined
): string {
	const previousBlock = formatSignatureBlock(previousSignature);
	const nextBlock = formatSignatureBlock(nextSignature);
	if (previousBlock && text.includes(previousBlock)) {
		return text.replace(previousBlock, nextBlock);
	}
	if (!nextBlock || text.includes(nextBlock)) {
		return text;
	}
	if (!text) {
		return nextBlock;
	}
	if (/^\s*[^\n]+ wrote:\n>/iu.test(text)) {
		return `${nextBlock}${text}`;
	}
	return `${text}${nextBlock}`;
}

const readerPath =
	/^\/(?:(?:inbox|starred|snoozed|sent|scheduled|archived|spam|trash)\/[^/]+|folders\/[^/]+\/[^/]+)\/?$/u;

/** An open message, where the phone Compose button would sit on the reader's Reply bar (Gmail hides it there too). */
export function isMessageReaderPath(pathname: string) {
	return readerPath.test(pathname);
}

/** The phone Compose button opens a composer, so it hides where one is already on screen. */
export function hidesComposeButton(pathname: string) {
	return isMessageReaderPath(pathname) || /^\/compose\/?$/u.test(pathname);
}
