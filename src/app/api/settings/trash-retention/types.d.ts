import type { z } from "zod";

import type { updateTrashRetentionSettingsSchema } from "@/lib/validators";

export type UpdateTrashRetentionSettingsInput = z.infer<
	typeof updateTrashRetentionSettingsSchema
>;

export interface TrashRetentionSettingsResponse {
	days?: number | null;
	error?: unknown;
}
