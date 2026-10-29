import type { z } from "zod";

import type { updateSpamSettingsSchema } from "@/lib/validators";

export type UpdateSpamSettingsInput = z.infer<typeof updateSpamSettingsSchema>;
