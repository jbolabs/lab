import { authFetch } from "@/lib/auth/client";
import { getMailboxFolders, invalidateFolderCache } from "@/lib/folders/client";
import { defaultTranslator } from "@/lib/i18n/utils";
import type { Translator } from "@/lib/i18n/utils";

import type {
	ImapFormState,
	ImportFolderSummary,
	ImportResult,
	ImportSourceItem,
	ImportSourceOption,
	ImportSourceSection,
} from "./types";

export const importSourceOptions: ImportSourceOption[] = [
	{
		destination: "system:inbox",
		imapFolder: "INBOX",
		label: "Inbox",
		system: true,
		value: "inbox",
	},
	{
		destination: "system:sent",
		imapFolder: "Sent",
		label: "Sent",
		system: true,
		value: "sent",
	},
	{
		destination: "system:drafts",
		imapFolder: "Drafts",
		label: "Drafts",
		system: true,
		value: "drafts",
	},
	{
		destination: "system:archived",
		imapFolder: "Archive",
		label: "Archived",
		system: true,
		value: "archived",
	},
	{
		destination: "system:spam",
		imapFolder: "Spam",
		label: "Spam",
		system: true,
		value: "spam",
	},
	{
		destination: "system:trash",
		imapFolder: "Trash",
		label: "Trash",
		system: true,
		value: "trash",
	},
	{
		destination: "system:inbox",
		imapFolder: "",
		label: "Others",
		value: "others",
	},
];

export function getImportSourceOption(
	section: ImportSourceSection
): ImportSourceOption {
	return (
		importSourceOptions.find((option) => option.value === section) ??
		importSourceOptions[0]
	);
}

export function getSelectedImportSources(
	sections: ImportSourceSection[]
): ImportSourceItem[] {
	return sections.map((section) => {
		const option = getImportSourceOption(section);
		return {
			destination: option.destination,
			id: `system:${option.value}`,
			imapFolder: option.imapFolder,
			label: option.label,
			sourceSection: option.value,
		};
	});
}

export function getFolderImportSource(folderName: string): ImportSourceItem {
	return {
		destination: "",
		folderName,
		id: `folder:${folderName}`,
		imapFolder: folderName,
		label: folderName,
	};
}

function getFolderAliases(section: ImportSourceSection): string[] {
	if (section === "inbox") {
		return ["INBOX", "Inbox"];
	}
	if (section === "sent") {
		return [
			"Sent",
			"Sent Mail",
			"[Gmail]/Sent Mail",
			"Sent Items",
			"Sent Messages",
		];
	}
	if (section === "drafts") {
		return ["Drafts", "[Gmail]/Drafts"];
	}
	if (section === "archived") {
		return ["Archive", "Archived", "[Gmail]/All Mail"];
	}
	if (section === "spam") {
		return ["Spam", "Junk", "Junk Email", "[Gmail]/Spam"];
	}
	if (section === "trash") {
		return [
			"Trash",
			"Deleted",
			"Deleted Items",
			"Deleted Messages",
			"[Gmail]/Trash",
		];
	}
	return [];
}

function normalizeFolderName(value: string): string {
	return value
		.toLowerCase()
		.replace(/^\[gmail\]\//u, "")
		.replaceAll(/\s+/gu, " ")
		.trim();
}

function findFolderMatch(folders: string[], aliases: string[]): string | null {
	const normalizedAliases = new Set(aliases.map(normalizeFolderName));
	return (
		folders.find((folder) =>
			normalizedAliases.has(normalizeFolderName(folder))
		) ?? null
	);
}

export function resolveImapSourceFolder(
	source: ImportSourceItem,
	folders: string[]
): string {
	if (!source.sourceSection || source.sourceSection === "others") {
		return source.imapFolder;
	}
	const match = findFolderMatch(
		folders,
		getFolderAliases(source.sourceSection)
	);
	return match ?? source.imapFolder;
}

export function filterCustomImapFolders(
	folders: string[],
	selectedSources: ImportSourceItem[]
): string[] {
	const systemAliases = new Set(
		(
			[
				"inbox",
				"sent",
				"drafts",
				"archived",
				"spam",
				"trash",
			] as ImportSourceSection[]
		)
			.flatMap(getFolderAliases)
			.map(normalizeFolderName)
	);
	for (const source of selectedSources) {
		const folder = resolveImapSourceFolder(source, folders);
		if (folder) {
			systemAliases.add(normalizeFolderName(folder));
		}
	}
	return folders.filter(
		(folder) => !systemAliases.has(normalizeFolderName(folder))
	);
}

export function getFileImportSource(
	sources: ImportSourceItem[]
): ImportSourceItem {
	return (
		sources.find((source) => source.id !== "system:others") ??
		getSelectedImportSources(["inbox"])[0]
	);
}

async function fetchMailboxFolders(
	mailboxId: string
): Promise<ImportFolderSummary[]> {
	const data = await getMailboxFolders<{ folders?: ImportFolderSummary[] }>(
		mailboxId
	);
	return data.folders ?? [];
}

export async function ensureImportDestination(
	mailboxId: string,
	source: ImportSourceItem
): Promise<string> {
	if (!source.folderName) {
		return source.destination;
	}
	const folders = await fetchMailboxFolders(mailboxId);
	const existing = folders.find(
		(folder) => folder.name.toLowerCase() === source.folderName?.toLowerCase()
	);
	if (existing) {
		return `folder:${existing.id}`;
	}

	const response = await authFetch("/api/folders", {
		body: JSON.stringify({ mailboxId, name: source.folderName }),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const data = (await response.json()) as ImportFolderSummary & {
		error?: string;
	};
	if (!response.ok) {
		throw new Error(
			data.error ?? `Unable to create folder ${source.folderName}`
		);
	}
	invalidateFolderCache();
	return `folder:${data.id}`;
}

export async function importFromImap(
	mailboxId: string,
	form: ImapFormState,
	destination: string,
	offset = 0
): Promise<ImportResult> {
	const response = await authFetch("/api/import/imap", {
		body: JSON.stringify({
			destination,
			folder: form.folder,
			host: form.host,
			limit: Number(form.limit),
			mailboxId,
			offset,
			password: form.password,
			port: Number(form.port),
			secure: form.secure,
			username: form.username,
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const data = (await response.json()) as ImportResult;
	if (!response.ok) {
		throw new Error(data.error ?? "IMAP import failed");
	}
	return data;
}

export async function fetchImapFolders(form: ImapFormState): Promise<string[]> {
	const response = await authFetch("/api/import/imap/folders", {
		body: JSON.stringify({
			host: form.host,
			password: form.password,
			port: Number(form.port),
			secure: form.secure,
			username: form.username,
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
	const data = (await response.json()) as {
		folders?: string[];
		error?: string;
	};
	if (!response.ok) {
		throw new Error(data.error ?? "Unable to list IMAP folders");
	}
	return data.folders ?? [];
}

export function formatImportResult(
	result: ImportResult | null,
	t: Translator = defaultTranslator
): string {
	if (!result) {
		return "";
	}
	return t("import.summary", {
		imported: result.imported ?? 0,
		skipped: result.skipped ?? 0,
	});
}
