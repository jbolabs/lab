export interface DeliveryStatRow {
	webhookId: string;
	status: string;
	total: number;
	lastAttemptAt: Date | number | null;
}

export interface WebhookDeliveryStats {
	total: number;
	delivered: number;
	failing: number;
	pending: number;
	lastAttemptAt: number | null;
}

/**
 * Aggregate columns bypass Drizzle's timestamp mapper, so `max()` comes back as the raw
 * SQLite value — seconds, since the column uses `mode: "timestamp"`. Normalise to epoch ms.
 */
function toEpochMs(value: Date | number | null | undefined): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (value instanceof Date) {
		return value.getTime();
	}
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return null;
	}
	return numeric < 1e12 ? numeric * 1000 : numeric;
}

/** Folds the grouped delivery counts into per-endpoint health for the webhooks list. */
export function summariseDeliveryStats(
	rows: DeliveryStatRow[],
	webhookId: string
): WebhookDeliveryStats {
	const own = rows.filter((row) => row.webhookId === webhookId);
	const byStatus = (status: string) =>
		own
			.filter((row) => row.status === status)
			.reduce((sum, row) => sum + row.total, 0);

	let lastAttemptAt: number | null = null;
	for (const row of own) {
		const value = toEpochMs(row.lastAttemptAt);
		if (value !== null && (lastAttemptAt === null || value > lastAttemptAt)) {
			lastAttemptAt = value;
		}
	}

	return {
		delivered: byStatus("delivered"),
		failing: byStatus("failed") + byStatus("exhausted"),
		lastAttemptAt,
		pending: byStatus("pending") + byStatus("retrying"),
		total: own.reduce((sum, row) => sum + row.total, 0),
	};
}
