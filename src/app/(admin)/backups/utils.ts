import { authFetch } from "@/lib/auth/client";
import { formatUserDate } from "@/lib/time/utils";

import type { BackupItem, BackupsResponse, BackupSettings } from "./types";

export const WEEKDAYS = [
	{ labelKey: "weekday.0" as const, value: 0 },
	{ labelKey: "weekday.1" as const, value: 1 },
	{ labelKey: "weekday.2" as const, value: 2 },
	{ labelKey: "weekday.3" as const, value: 3 },
	{ labelKey: "weekday.4" as const, value: 4 },
	{ labelKey: "weekday.5" as const, value: 5 },
	{ labelKey: "weekday.6" as const, value: 6 },
];

export async function fetchBackups(): Promise<BackupsResponse> {
	const response = await authFetch("/api/backups");
	const data = (await response.json()) as BackupsResponse & { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? "Failed to load backups");
	}
	return data;
}

export async function saveBackupSettings(
	settings: BackupSettings
): Promise<void> {
	const response = await authFetch("/api/backups", {
		body: JSON.stringify(settings),
		headers: { "Content-Type": "application/json" },
		method: "PUT",
	});
	const data = (await response.json()) as { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? "Failed to save backup settings");
	}
}

export async function startBackup(): Promise<void> {
	const response = await authFetch("/api/backups", { method: "POST" });
	const data = (await response.json()) as { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? "Failed to run backup");
	}
}

export async function removeBackup(id: string): Promise<void> {
	const response = await authFetch(`/api/backups/${id}`, { method: "DELETE" });
	const data = (await response.json()) as { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? "Failed to delete backup");
	}
}

export async function restoreBackup(file: File): Promise<void> {
	const form = new FormData();
	form.set("backup", file);
	const response = await authFetch("/api/backups/restore", {
		body: form,
		method: "POST",
	});
	const data = (await response.json()) as { error?: string };
	if (!response.ok) {
		throw new Error(data.error ?? "Failed to restore backup");
	}
}

export async function downloadBackup(backup: BackupItem): Promise<void> {
	const response = await authFetch(`/api/backups/${backup.id}/download`);
	if (!response.ok) {
		const data = (await response.json()) as { error?: string };
		throw new Error(data.error ?? "Failed to download backup");
	}
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = backup.filename ?? `${backup.id}.sql`;
	// Cloudflare declares a different global Element for HTMLRewriter.
	// oxlint-disable-next-line unicorn/prefer-dom-node-append -- append accepts the conflicting Cloudflare Element type; appendChild preserves the DOM Node type.
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export function formatBackupDate(value: string | null): string {
	if (!value) {
		return "-";
	}
	return formatUserDate(value, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

export function formatBackupSize(value: number | null): string {
	if (value === null) {
		return "-";
	}
	if (value < 1024) {
		return `${value} B`;
	}
	if (value < 1024 * 1024) {
		return `${(value / 1024).toFixed(1)} KB`;
	}
	return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export const BACKUP_STATUS_BADGE = {
	completed: "success",
	failed: "destructive-soft",
	queued: "warning",
	running: "signal",
} as const satisfies Record<
	BackupItem["status"],
	"success" | "destructive-soft" | "signal" | "warning"
>;
