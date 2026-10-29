import { BACKUP_TABLE_GROUPS } from "@/lib/backups/table-groups";

import type { BackupSettingsInput } from "./types";

const SCHEDULE_TYPES = new Set(["daily", "weekly", "monthly"]);

function isIntegerInRange(
	value: number,
	minimum: number,
	maximum: number
): boolean {
	return Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function parseBackupSettingsInput(
	value: unknown
): BackupSettingsInput | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const input = value as Record<string, unknown>;
	if (typeof input.enabled !== "boolean") {
		return null;
	}
	if (
		typeof input.scheduleType !== "string" ||
		!SCHEDULE_TYPES.has(input.scheduleType)
	) {
		return null;
	}
	if (typeof input.retentionEnabled !== "boolean") {
		return null;
	}
	if (!Array.isArray(input.excludedTableGroups)) {
		return null;
	}
	const groupIds = new Set<string>(
		BACKUP_TABLE_GROUPS.map((group) => group.id)
	);
	if (
		!input.excludedTableGroups.every(
			(id) => typeof id === "string" && groupIds.has(id)
		)
	) {
		return null;
	}
	const excludedTableGroups = [
		...new Set(input.excludedTableGroups),
	] as BackupSettingsInput["excludedTableGroups"];
	if (excludedTableGroups.length === BACKUP_TABLE_GROUPS.length) {
		return null;
	}

	const retentionDays = Number(input.retentionDays);
	if (!isIntegerInRange(retentionDays, 1, 3650)) {
		return null;
	}
	let scheduleValue: number | null = null;
	if (input.scheduleType === "weekly") {
		scheduleValue = Number(input.scheduleValue);
		if (!isIntegerInRange(scheduleValue, 0, 6)) {
			return null;
		}
	}

	if (input.scheduleType === "monthly") {
		scheduleValue = Number(input.scheduleValue);
		if (!isIntegerInRange(scheduleValue, 1, 28)) {
			return null;
		}
	}

	return {
		enabled: input.enabled,
		excludedTableGroups,
		retentionDays,
		retentionEnabled: input.retentionEnabled,
		scheduleType: input.scheduleType as BackupSettingsInput["scheduleType"],
		scheduleValue,
	};
}
