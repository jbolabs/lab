import type { z } from "zod";

import type { updateShortcutsSettingsSchema } from "@/lib/validators";

export type UpdateShortcutsSettingsInput = z.infer<
	typeof updateShortcutsSettingsSchema
>;
