import type { z } from "zod";

import type { updateRecipientAddressSettingsSchema } from "@/lib/validators";

export type UpdateRecipientAddressSettingsInput = z.infer<
	typeof updateRecipientAddressSettingsSchema
>;
