import {
	File as FileIcon,
	FileArchive,
	FileAudio,
	FileCode,
	FileImage,
	FileSpreadsheet,
	FileText,
	FileVideo,
	Folder,
	Presentation,
} from "lucide-react";

import { driveKindOf } from "@/lib/drive/kind";
import type { DriveKind } from "@/lib/drive/kind";
import type { DriveItemDto } from "@/lib/drive/types";

// One icon and colour per kind of file. Palette classes, not hex, so the dark theme remaps them.
export const DRIVE_KIND_ICONS: Record<
	DriveKind,
	{ Icon: typeof FileIcon; className: string }
> = {
	archive: { Icon: FileArchive, className: "text-yellow-700" },
	audio: { Icon: FileAudio, className: "text-orange-500" },
	code: { Icon: FileCode, className: "text-teal-500" },
	file: { Icon: FileIcon, className: "text-muted-foreground" },
	folder: { Icon: Folder, className: "text-amber-500" },
	image: { Icon: FileImage, className: "text-rose-500" },
	pdf: { Icon: FileText, className: "text-red-600" },
	sheet: { Icon: FileSpreadsheet, className: "text-green-600" },
	slides: { Icon: Presentation, className: "text-orange-600" },
	text: { Icon: FileText, className: "text-signal" },
	video: { Icon: FileVideo, className: "text-purple-500" },
};

export function driveIconFor(
	item: Pick<DriveItemDto, "kind" | "contentType" | "name">
) {
	return DRIVE_KIND_ICONS[driveKindOf(item)];
}

export type DriveSortKey = "name" | "owner" | "updatedAt" | "size";

const compareDriveText = (a: string, b: string) =>
	a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export function sortDriveItems<
	T extends Pick<DriveItemDto, "kind" | "name" | "updatedAt"> & {
		ownerName?: string;
		role?: string;
		size?: number;
	},
>(items: T[], key: DriveSortKey, ascending: boolean): T[] {
	const direction = ascending ? 1 : -1;

	return [...items].toSorted((a, b) => {
		if (a.kind !== b.kind) {
			return a.kind === "folder" ? -1 : 1;
		}
		let compared: number;
		if (key === "updatedAt") {
			compared = a.updatedAt.localeCompare(b.updatedAt);
		} else if (key === "size") {
			compared = (a.size ?? 0) - (b.size ?? 0);
		} else if (key === "owner") {
			compared = compareDriveText(
				a.role === "owner" ? "" : (a.ownerName ?? ""),
				b.role === "owner" ? "" : (b.ownerName ?? "")
			);
		} else {
			compared = 0;
		}
		return (compared || compareDriveText(a.name, b.name)) * direction;
	});
}

export function contentUrl(id: string, download = false): string {
	return `/api/drive/items/${encodeURIComponent(id)}/content${download ? "?download=1" : ""}`;
}

/** URL of a file's bytes: a Drive file, or an email attachment when the item comes from mail. */
export function driveFileUrl(
	item: Pick<DriveItemDto, "id" | "source">,
	download = false
): string {
	return item.source
		? `/api/drive/attachments/${encodeURIComponent(item.id)}/content${download ? "?download=1" : ""}`
		: contentUrl(item.id, download);
}

export function emailUrl(source: NonNullable<DriveItemDto["source"]>): string {
	return `/${source.direction === "outbound" ? "sent" : "inbox"}/${encodeURIComponent(source.messageId)}`;
}

export function publicContentUrl(
	token: string,
	itemId: string,
	download = false
): string {
	return `/api/drive/public/${encodeURIComponent(token)}?item=${encodeURIComponent(itemId)}&${download ? "download=1" : "content=1"}`;
}

export function publicPosterUrl(token: string, itemId: string): string {
	return `/api/drive/public/${encodeURIComponent(token)}?item=${encodeURIComponent(itemId)}&poster=1`;
}

export function canPreview(contentType: string): boolean {
	return (
		(contentType.startsWith("image/") && contentType !== "image/svg+xml") ||
		contentType.startsWith("video/") ||
		contentType.startsWith("audio/") ||
		contentType === "application/pdf" ||
		contentType === "text/plain" ||
		contentType === "text/csv" ||
		contentType === "application/json"
	);
}
