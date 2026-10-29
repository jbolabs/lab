import {
	DEFAULT_FOLDER_COLOR,
	FOLDER_COLOR_VALUES,
} from "@/lib/folders/colors";
import type { FolderColor } from "@/lib/folders/types";

const LEGACY_CALENDAR_COLORS: Record<string, FolderColor> = {
	blue: "#2563eb",
	emerald: "#16a34a",
	orange: "#ea580c",
	rose: "#db2777",
	violet: "#7c3aed",
};

export function normalizeCalendarColor(value: string | undefined): FolderColor {
	return (
		FOLDER_COLOR_VALUES.find((color) => color === value) ??
		LEGACY_CALENDAR_COLORS[value ?? ""] ??
		DEFAULT_FOLDER_COLOR
	);
}
