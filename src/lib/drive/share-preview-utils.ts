import { driveExtension } from "./kind";
import { formatDriveSize } from "./utils";

export const OG_IMAGE = { height: 630, width: 1200 } as const;

/** One line under a shared item's name: "MP4 · 2.3 MB" or "Folder · 4 items". */
export function describeDriveItem(
	item: { kind: "file" | "folder"; name: string; size: number },
	childCount = 0
): string {
	if (item.kind === "folder") {
		return `Folder · ${childCount} ${childCount === 1 ? "item" : "items"}`;
	}
	const extension = driveExtension(item.name).toUpperCase();
	const size = formatDriveSize(item.size);
	return extension && extension.length <= 5 ? `${extension} · ${size}` : size;
}
