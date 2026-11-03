/** What a Drive item is, from its type and name. The Drive icons and the share link's preview card both read this. */
export type DriveKind =
	| "folder"
	| "image"
	| "video"
	| "audio"
	| "pdf"
	| "sheet"
	| "slides"
	| "archive"
	| "code"
	| "text"
	| "file";

export const DRIVE_KINDS: readonly DriveKind[] = [
	"folder",
	"image",
	"video",
	"audio",
	"pdf",
	"sheet",
	"slides",
	"archive",
	"code",
	"text",
	"file",
];

export const driveExtension = (name: string) =>
	name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";

const SPREADSHEET = /spreadsheet|ms-excel|csv/u;
const PRESENTATION = /presentation|ms-powerpoint/u;
const ARCHIVE = /zip|compressed|x-tar|gzip|rar|7z/u;
const CODE_EXTENSIONS = new Set([
	"js",
	"ts",
	"tsx",
	"jsx",
	"json",
	"html",
	"css",
	"py",
	"rb",
	"go",
	"rs",
	"java",
	"c",
	"cpp",
	"h",
	"sh",
	"sql",
	"yml",
	"yaml",
	"xml",
]);

export function driveKindOf(item: {
	kind: "file" | "folder";
	contentType: string;
	name: string;
}): DriveKind {
	if (item.kind === "folder") {
		return "folder";
	}
	const type = item.contentType;
	const extension = driveExtension(item.name);
	if (type.startsWith("image/")) {
		return "image";
	}
	if (type.startsWith("video/")) {
		return "video";
	}
	if (type.startsWith("audio/")) {
		return "audio";
	}
	if (type === "application/pdf" || extension === "pdf") {
		return "pdf";
	}
	if (
		SPREADSHEET.test(type) ||
		["xls", "xlsx", "ods", "csv", "numbers"].includes(extension)
	) {
		return "sheet";
	}
	if (
		PRESENTATION.test(type) ||
		["ppt", "pptx", "odp", "key"].includes(extension)
	) {
		return "slides";
	}
	if (
		ARCHIVE.test(type) ||
		["zip", "rar", "7z", "tar", "gz"].includes(extension)
	) {
		return "archive";
	}
	if (
		CODE_EXTENSIONS.has(extension) ||
		["application/json", "javascript", "xml"].some((value) =>
			type.includes(value)
		)
	) {
		return "code";
	}
	if (
		type.startsWith("text/") ||
		type.includes("word") ||
		type.includes("opendocument.text") ||
		["doc", "docx", "odt", "rtf", "txt", "md", "pages"].includes(extension)
	) {
		return "text";
	}
	return "file";
}
