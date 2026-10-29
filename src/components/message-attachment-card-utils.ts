import {
	FileArchive,
	FileCode,
	FileSpreadsheet,
	FileText,
	FileType,
	FileVideoCamera,
	Image,
	Music,
	Presentation,
} from "lucide-react";

import type { MessageAttachment } from "@/app/(dashboard)/inbox/[messageId]/types";

import type { AttachmentVisual } from "./message-attachment-card-types";
import { getAttachmentPreviewKind } from "./message-attachment-viewer-utils";

function isSpreadsheet(type: string, filename: string): boolean {
	return (
		type.includes("spreadsheet") ||
		type.includes("excel") ||
		type === "text/csv" ||
		/\.(?:csv|xls|xlsx|ods)$/u.test(filename)
	);
}

function isPresentation(type: string, filename: string): boolean {
	return (
		type.includes("presentation") ||
		type.includes("powerpoint") ||
		/\.(?:ppt|pptx|odp)$/u.test(filename)
	);
}

function isArchive(type: string, filename: string): boolean {
	return (
		type.includes("zip") ||
		type.includes("compressed") ||
		type.includes("archive") ||
		/\.(?:zip|rar|7z|tar|gz|bz2)$/u.test(filename)
	);
}

function isCode(type: string, filename: string): boolean {
	return (
		type.includes("json") ||
		type.includes("xml") ||
		type.includes("javascript") ||
		type.includes("typescript") ||
		/\.(?:js|jsx|ts|tsx|json|xml|html|css|md|yml|yaml)$/u.test(filename)
	);
}

function isDocument(
	type: string,
	filename: string,
	previewKind: string
): boolean {
	return (
		previewKind === "text" ||
		type.includes("word") ||
		/\.(?:doc|docx|odt|rtf|txt)$/u.test(filename)
	);
}

export function getAttachmentVisual(
	attachment: Pick<MessageAttachment, "filename" | "type">
): AttachmentVisual {
	const type = attachment.type.toLowerCase();
	const filename = attachment.filename.toLowerCase();
	const previewKind = getAttachmentPreviewKind(attachment);

	if (previewKind === "image") {
		return {
			icon: Image,
			iconClassName: "bg-signal-soft text-signal",
			labelKey: "attachment.image",
			thumbnail: "image",
		};
	}
	if (previewKind === "video") {
		return {
			icon: FileVideoCamera,
			iconClassName: "bg-rose-50 text-rose-700",
			labelKey: "attachment.video",
			thumbnail: "video",
		};
	}
	if (previewKind === "audio") {
		return {
			icon: Music,
			iconClassName: "bg-orange-50 text-orange-700",
			labelKey: "attachment.audio",
			thumbnail: null,
		};
	}
	if (previewKind === "pdf") {
		return {
			icon: FileText,
			iconClassName: "bg-red-50 text-red-700",
			labelKey: "attachment.pdf",
			thumbnail: null,
		};
	}
	if (isSpreadsheet(type, filename)) {
		return {
			icon: FileSpreadsheet,
			iconClassName: "bg-emerald-50 text-emerald-700",
			labelKey: "attachment.spreadsheet",
			thumbnail: null,
		};
	}
	if (isPresentation(type, filename)) {
		return {
			icon: Presentation,
			iconClassName: "bg-amber-50 text-amber-700",
			labelKey: "attachment.presentation",
			thumbnail: null,
		};
	}
	if (isArchive(type, filename)) {
		return {
			icon: FileArchive,
			iconClassName: "bg-violet-50 text-violet-700",
			labelKey: "attachment.archive",
			thumbnail: null,
		};
	}
	if (isCode(type, filename)) {
		return {
			icon: FileCode,
			iconClassName: "bg-cyan-50 text-cyan-700",
			labelKey: "attachment.code",
			thumbnail: null,
		};
	}
	if (isDocument(type, filename, previewKind)) {
		return {
			icon: FileType,
			iconClassName: "bg-sky-50 text-sky-700",
			labelKey: "attachment.document",
			thumbnail: null,
		};
	}

	return {
		icon: FileText,
		iconClassName: "bg-muted text-muted-foreground",
		labelKey: "attachment.file",
		thumbnail: null,
	};
}
