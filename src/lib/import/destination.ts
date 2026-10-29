import type {
	ImportDestination,
	ImportMessagePlacement,
	ImportSystemSection,
} from "./destination-types";

const systemSections = new Set<ImportSystemSection>([
	"inbox",
	"sent",
	"drafts",
	"archived",
	"spam",
	"trash",
]);

export const DEFAULT_IMPORT_DESTINATION = "system:inbox";

export function parseImportDestination(value: unknown): ImportDestination {
	const destination =
		typeof value === "string" && value.trim()
			? value.trim()
			: DEFAULT_IMPORT_DESTINATION;
	if (destination.startsWith("folder:")) {
		const folderId = destination.slice("folder:".length).trim();
		if (!folderId) {
			throw new Error("Import folder is required");
		}
		return { folderId, type: "folder" };
	}

	const section = destination.startsWith("system:")
		? destination.slice("system:".length)
		: destination;
	if (systemSections.has(section as ImportSystemSection)) {
		return { section: section as ImportSystemSection, type: "system" };
	}

	throw new Error("Import destination is invalid");
}

export function getImportMessagePlacement(
	destination: ImportDestination
): ImportMessagePlacement {
	if (destination.type === "folder") {
		return {
			direction: "inbound",
			folderId: destination.folderId,
			status: "received",
		};
	}

	if (destination.section === "sent") {
		return { direction: "outbound", folderId: null, status: "sent" };
	}

	if (destination.section === "drafts") {
		return { direction: "outbound", folderId: null, status: "draft" };
	}

	if (destination.section === "archived") {
		return { direction: "inbound", folderId: null, status: "archived" };
	}

	if (destination.section === "spam" || destination.section === "trash") {
		return {
			direction: "inbound",
			folderId: null,
			status: destination.section,
		};
	}

	return { direction: "inbound", folderId: null, status: "received" };
}

export function getImportMessageUserId(
	destination: ImportDestination,
	currentUserId: string,
	mailboxUserId: string
): string {
	if (
		destination.type === "system" &&
		(destination.section === "sent" || destination.section === "drafts")
	) {
		return currentUserId;
	}
	return mailboxUserId;
}
