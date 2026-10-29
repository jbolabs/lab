import type { FolderColorOption } from "./types";

export const FOLDER_COLOR_VALUES = [
	"#2563eb",
	"#7c3aed",
	"#db2777",
	"#dc2626",
	"#ea580c",
	"#d97706",
	"#16a34a",
	"#0d9488",
] as const;

export const [DEFAULT_FOLDER_COLOR] = FOLDER_COLOR_VALUES;

export const FOLDER_COLOR_OPTIONS: FolderColorOption[] = [
	{ label: "Blue", value: "#2563eb" },
	{ label: "Purple", value: "#7c3aed" },
	{ label: "Pink", value: "#db2777" },
	{ label: "Red", value: "#dc2626" },
	{ label: "Orange", value: "#ea580c" },
	{ label: "Amber", value: "#d97706" },
	{ label: "Green", value: "#16a34a" },
	{ label: "Teal", value: "#0d9488" },
];
