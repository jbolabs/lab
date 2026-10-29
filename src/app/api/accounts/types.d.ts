import type { output } from "zod";

import type { createUserAccountSchema } from "@/lib/validators";

export interface AccountListItem {
	id: string;
	email: string;
	name: string;
	resetEmail: string | null;
	role: "admin" | "user";
	createdAt: Date;
	hasAvatar?: boolean;
	canManageMailboxes?: boolean;
	mailboxId: string | null;
	localPart: string | null;
	hostname: string | null;
}

export interface CreateAccountResult {
	id?: string;
	email?: string;
	mailboxId?: string;
	error?: unknown;
}

export type CreateUserAccountInput = output<typeof createUserAccountSchema>;

export interface AccountListResponse {
	accounts?: AccountListItem[];
	error?: string;
}
