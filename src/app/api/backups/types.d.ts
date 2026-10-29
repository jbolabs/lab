import type {
	BackupScheduleType,
	BackupTableGroupId,
} from "@/lib/backups/types";

export interface BackupSettingsInput {
	enabled: boolean;
	scheduleType: BackupScheduleType;
	scheduleValue: number | null;
	retentionEnabled: boolean;
	retentionDays: number;
	excludedTableGroups: BackupTableGroupId[];
}
