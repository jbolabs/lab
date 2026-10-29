import type { TranslationKey } from "@/lib/i18n/types";

import type { FolderColor } from "./types";

/** Translation keys for the names of the shared folder/event colors. */
export const folderColorKeys = {
	"#0d9488": "color.teal",
	"#16a34a": "color.green",
	"#2563eb": "color.blue",
	"#7c3aed": "color.purple",
	"#d97706": "color.amber",
	"#db2777": "color.pink",
	"#dc2626": "color.red",
	"#ea580c": "color.orange",
} satisfies Record<FolderColor, TranslationKey>;
