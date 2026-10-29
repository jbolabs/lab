import type { z } from "zod";

import type { changePasswordSchema } from "@/lib/validators";

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
