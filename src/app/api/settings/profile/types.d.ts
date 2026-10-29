import type { z } from "zod";

import type { updateProfileSchema } from "@/lib/validators";

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface ProfileResponse {
	user: {
		id: string;
		email: string;
		name: string;
		resetEmail: string | null;
		forwardingEmail: string | null;
	};
}
