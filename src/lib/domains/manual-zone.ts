export const MANUAL_ZONE_ID = "manual";

export function isManualZone(zoneId: string | null | undefined): boolean {
	return zoneId === MANUAL_ZONE_ID;
}
