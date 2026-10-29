import type { BackupTableGroupId } from "@/lib/backups/types";

export type BackupScheduleType = "daily" | "weekly" | "monthly";
export type BackupStatus = "queued" | "running" | "completed" | "failed";

export interface BackupSettings {
	id: string;
	enabled: boolean;
	scheduleType: BackupScheduleType;
	scheduleValue: number | null;
	retentionEnabled: boolean;
	retentionDays: number;
	excludedTableGroups: BackupTableGroupId[];
	updatedAt: string;
}

export interface BackupItem {
	id: string;
	status: BackupStatus;
	trigger: "manual" | "scheduled";
	filename: string | null;
	size: number | null;
	error: string | null;
	createdAt: string;
	startedAt: string | null;
	completedAt: string | null;
}

export interface BackupsResponse {
	settings: BackupSettings;
	backups: BackupItem[];
	configuration: {
		configured: boolean;
		missing: string[];
	};
}
