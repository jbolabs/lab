import type { z } from "zod";

import type { updateForwardingEmailSchema } from "@/lib/validators";

export type UpdateForwardingEmailInput = z.infer<
	typeof updateForwardingEmailSchema
>;
